import 'reflect-metadata';

import { expect } from 'chai';
import Hapi = require('hapi');

import { DEPLOYMENT_EVENT_TYPE, DeploymentEvent } from '../deployment';
import { default as EventBus } from '../event-bus/local-event-bus';
import loggerConstructor from '../shared/logger';
import { CIProxy } from './proxy-ci';

const h2o2 = require('h2o2');

// https://github.com/hapijs/h2o2/blob/master/test/index.js
const provisionProxy = async (
  upstream = 'http://localhost:80',
  options: Hapi.IServerConnectionOptions = { port: 8080 }) => {
  const logger = loggerConstructor(undefined, false, true);
  const bus = new EventBus();
  const plugin = new CIProxy(upstream, bus, logger);

  const proxy = new Hapi.Server();
  proxy.connection(options);
  await proxy.register([h2o2, plugin]);
  return {proxy, bus, plugin};
};

const provisionUpstream = async (options: Hapi.IServerConnectionOptions = { port: 8090, address: '127.0.0.1' }) => {
  const server = new Hapi.Server();
  server.connection(options);
  return server;
};

describe('ci-proxy', () => {

  let upstream: Hapi.Server;
  beforeEach(async () => {
    upstream = await provisionUpstream();
  });
  afterEach(() => {
    upstream.stop();
  });

  it('registers itself without errors', async () => {
    await provisionProxy();
  });

  it('proxies everything under routeNamespace', async () => {
    const { proxy, plugin } = await provisionProxy(`http://localhost:${upstream.info.port}`);

    const path = plugin.routeNamespace + 'foo/bar/';
    upstream.route([{
      method: 'GET',
      path,
      handler: (_req: any, rep: any) => {
        return rep('Ok!');
      },
    }]);
    await upstream.start();

    const response = await proxy.inject({
      method: 'GET',
      url: path,
    });
    expect(response.statusCode).to.equal(200);
    expect(response.payload).to.equal('Ok!');
    await upstream.stop();
  });

  it('doesn\'t proxy weird paths' , async () => {
    const path = '/foo/bar';
    upstream.route([{
      method: 'PUT',
      path,
      handler: (_req: any, rep: any) => {
        return rep('Ok!');
      },
    }]);
    await upstream.start();
    const { proxy } = await provisionProxy(`http://localhost:${upstream.info.port}`);

    const response = await proxy.inject({
      method: 'PUT',
      url: path,
    });
    expect(response.statusCode).to.equal(404);
  });

  it('Posts build started event' , async () => {

    const { proxy, bus, plugin } = await provisionProxy(`http://localhost:${upstream.info.port}`);
    const path = plugin.routeNamespace + 'builds/register.json';

    upstream.route([{
      method: 'POST',
      path,
      handler: (_req: any, rep: any) => {
        return rep({
          status: 'running',
          id: 1,
        }).code(201);
      },
    }]);
    await upstream.start();

    const eventPromise = bus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .map(e => e.payload)
      .take(1)
      .toPromise();

    const responsePromise = proxy.inject({
      method: 'POST',
      url: path,
    });

    const [event, response] = await Promise.all([eventPromise, responsePromise]);
    expect(event.status).to.eq('running');
    expect(response.statusCode).to.eq(201);
  });

  it('Posts status updates' , async () => {

    const { proxy, bus, plugin } = await provisionProxy(`http://localhost:${upstream.info.port}`);

    const path = plugin.routeNamespace + 'builds/1';

    upstream.route([{
      method: 'PUT',
      path,
      handler: (_req: any, rep: any) => {
        return rep({
          state: 'cancelled',
          id: 1,
        });
      },
    }]);
    await upstream.start();

    const eventPromise = bus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .map(e => e.payload)
      .take(1)
      .toPromise();

    const responsePromise = proxy.inject({
      method: 'PUT',
      url: path,
      headers: {
        'Content-Type': 'application/json',
      },
      payload: {
        state: 'cancelled',
        id: 1,
      },
    });

    const [event, response] = await Promise.all([eventPromise, responsePromise]);
    expect(event.status).to.eq('cancelled');
    expect(response.statusCode).to.eq(200);
  });

});
