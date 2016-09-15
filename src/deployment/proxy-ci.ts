
import * as events from 'events';
import * as http from 'http';
import * as url from 'url';

import * as Hapi from 'hapi';

import { inject, injectable } from 'inversify';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { HapiRegister } from '../server/hapi-register';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import * as logger from '../shared/logger';
import { BuildCreated, createDeploymentEvent } from './types';

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
      handler: this.putRequestHandler.bind(this),
      config,
    });

    server.route({
      method: 'POST',
      path: this.routeNamespace + '{entities}/register.json',
      handler: {
        proxy: Object.assign({}, this.proxyOptions, {
          onResponse: this.postReplyHandler.bind(this),
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
          console.log(err);
        });
    } catch (err) {
      console.log(err);
    }
    reply.proxy(this.proxyOptions);
  }

  private postEvent(deploymentId: number, status: string, projectId?: number) {
    const event = createDeploymentEvent({
      id: deploymentId,
      status,
      projectId: projectId || undefined,
    } as any);
    this.eventBus.post(event);
    return event;
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
          const payload = _payload as BuildCreated;
          this.postEvent(payload.id, payload.status, payload.project_id);
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
