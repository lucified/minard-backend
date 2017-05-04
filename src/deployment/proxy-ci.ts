import * as events from 'events';
import * as http from 'http';
import * as url from 'url';

import { inject, injectable } from 'inversify';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import * as logger from '../shared/logger';

import {
  BuildCreatedEvent,
  createBuildCreatedEvent,
  createBuildStatusEvent,
} from './types';

@injectable()
export class CIProxy {

  public static readonly injectSymbol = Symbol('ci-proxy');
  private gitlabHost: string;
  private proxyOptions: { host: string, port: number, protocol: string, passThrough: boolean };
  private eventBus: EventBus;
  private logger: logger.Logger;
  public readonly routeNamespace = '/ci/api/v1/';
  public readonly routePath = this.routeNamespace + '{what}/{id}/{action?}';
  public constructor(
    @inject(gitlabHostInjectSymbol) gitlabHost: string,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {

    this.gitlabHost = gitlabHost;
    this.eventBus = eventBus;
    this.logger = logger;
    const gitlab = url.parse(gitlabHost);

    if (!gitlab.hostname) {
      throw new Error('Malformed gitlab baseurl: ' + gitlabHost);
    }

    this.proxyOptions = {
      host: gitlab.hostname,
      port: gitlab.port ? parseInt(gitlab.port, 10) : 80,
      protocol: gitlab.protocol || 'http',
      passThrough: true,
    };

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'ciproxy-plugin',
        version: '1.0.0',
      },
    });
  }

  private _register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    const config = {
      bind: this,
      auth: false,
      payload: {
        output: 'stream',
        parse: false,
      },
    };

    server.route({
      method: '*',
      path: this.routeNamespace + '{path*}',
      handler: {
        proxy: this.proxyOptions,
      },
      config,
    });

    server.route({
      method: 'PUT',
      path: this.routeNamespace + 'builds/{id}',
      handler: this.putRequestHandler,
      config,
    });

    server.route({
      method: 'POST',
      path: this.routeNamespace + '{entities}/register.json',
      handler: {
        proxy: Object.assign({}, this.proxyOptions, {
          onResponse: this.postReplyHandler,
        }),
      },
      config,
    });

    next();
  }

  public readonly register: HapiRegister;

  private putRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const id = parseInt(request.paramsArray[0], 10);
      this.collectStream(request.payload)
        .then(JSON.parse)
        .then(payload => this.postEvent(id, payload.state))
        .catch(err => {
          this.logger.warn(err.message, err);
        });
    } catch (err) {
      console.log(err);
    }
    reply.proxy(this.proxyOptions);
  }

  private postEvent(deploymentId: number, status: string) {
    if (status === 'success'
      || status === 'failed'
      || status === 'canceled'
      || status === 'pending'
      || status === 'running') {
      const event = createBuildStatusEvent({
        deploymentId,
        status: status as 'success' | 'failed' | 'canceled' | 'pending' | 'running',
      });
      this.eventBus.post(event);
      return event;
    } else {
      this.logger.warn(
        `Deployments status was ${status} for deployment ${deploymentId}. Not posting build status event.`);
    }
    return undefined;
  }

  private postReplyHandler(
    err: any,
    response: http.IncomingMessage,  // note that this is incorrect in the hapi type def
    request: Hapi.Request,
    reply: Hapi.IReply) {

    if (err) {
      console.log(err);
      return Promise.resolve(reply(err));
    }
    // Created
    if (response.statusCode === 201) {
      if (request.paramsArray[0] === 'builds') {
        return this.deploymentCreatedHandler(response, reply);
      }
      if (request.paramsArray[0] === 'runners') {
        return this.runnerRegisteredHandler(response, reply);
      }
    }
    return Promise.resolve(reply(response));
  }

  private deploymentCreatedHandler(response: http.IncomingMessage, reply: Hapi.IReply) {
    try {
      return this.collectStream(response)
        .then(JSON.parse)
        .then(_payload => {
          const payload = _payload as BuildCreatedEvent;
          this.eventBus.post(createBuildCreatedEvent(payload));
          return reply(payload).charset('').code(201);
        })
        .catch(_err => Promise.resolve(reply(_err)));
    } catch (err) {
      return Promise.resolve(reply(err));
    }
  }

  private runnerRegisteredHandler(response: http.IncomingMessage, reply: Hapi.IReply) {
    try {
      return this.collectStream(response)
        .then(JSON.parse)
        .then(payload => {
          return reply(payload).charset('').code(201);
        })
        .catch(_err => Promise.resolve(reply(_err)));
    } catch (err) {
      return Promise.resolve(reply(err));
    }
  }

  private collectStream(s: events.EventEmitter): Promise<string> {
    if (!s || !s.on) {
      throw new Error('s is not an EventEmitter');
    }
    const body: Buffer[] = [];
    return new Promise((resolve, reject) => {
      s.on('error', (err: any) => {
        reject(err);
      }).on('data', (chunk: Buffer) => {
        body.push(chunk);
      }).on('end', () => {
        resolve(Buffer.concat(body).toString());
      });
    });
  }
}
