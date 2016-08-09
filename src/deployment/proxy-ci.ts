import * as events from 'events';
import * as Hapi from 'hapi';
import * as http from 'http';
import * as url from 'url';

import { inject, injectable } from 'inversify';

import { EventBus, injectSymbol as eventBusInjectSymbol } from '../event-bus';
import { HapiRegister } from '../server/hapi-register';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import * as logger from '../shared/logger';
import { createDeploymentEvent } from './types';

function isJson(headers: Hapi.IDictionary<string>) {
  if (!headers) {
    return false;
  }
  const contentType = headers['content-type'] || headers['Content-Type'];
  return contentType && contentType.toLowerCase().indexOf('json') >= 0;
}

@injectable()
export class CIProxy {

  public static readonly injectSymbol = Symbol();
  private gitlabHost: string;
  private upstream: { host: string, port: number, protocol: string };
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

    this.upstream = {
      host: gitlab.hostname,
      port: gitlab.port ? parseInt(gitlab.port, 10) : 80,
      protocol: gitlab.protocol || 'http',
    };

    this.register = Object.assign(this._register.bind(this), {attributes: {
      name: 'ciproxy-plugin',
      version: '1.0.0',
    }});

  }

  private _register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    server.route({
      method: '*',
      path: this.routePath,
      handler: this.requestHandler.bind(this),
      config: {
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    next();
  }

  public readonly register: HapiRegister;

  private requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    this.onRequest(request);
    if (reply.proxy) {
      reply.proxy(Object.assign(this.upstream, {
        passThrough: true,
        onResponse: this.onResponse.bind(this),
      }));
    } else {
      reply('No proxy-plugin');
    }
  }

  private onRequest(request: Hapi.Request): void {
    let method = request.method;
    if (!method) {
      return;
    }
    method = method.toLocaleLowerCase();
    if (method !== 'put' || !isJson(request.headers)) {
      return;
    }
    this.collectStream(request.payload)
      .then(JSON.parse)
      .then(this.postEvent.bind(this));
  }

  private postEvent(payload: any) {
    if (payload && payload.status && payload.id) {
      this.eventBus.post(createDeploymentEvent({
        id: parseInt(payload.id, 10),
        status: payload.status,
        projectId: payload.project_id ? parseInt(payload.project_id, 10) : undefined,
      }));
    }
  }

  private onResponse(
    err: any,
    response: http.IncomingMessage,  // note that this is incorrect in the hapi type def
    request: Hapi.Request,
    reply: Hapi.IReply) {
    if (err) {
      console.error(err);
      reply(response);
      return;
    }
    if (isJson(response.headers)) {
      const whatKey = 'what';
      const idKey = 'id';
      if (request.method === 'post'
        && response.statusCode === 201
        && request.params[whatKey] === 'builds'
        && request.params[idKey] === 'register') {
        this.collectStream(response)
          .then((payload: any) => {
            this.postEvent(JSON.parse(payload));
            const r = reply(payload).charset('');
            r.headers = response.headers;
            r.statusCode = response.statusCode ? response.statusCode : 200;
          });

      } else {
        reply(response).charset('');
      }
    } else {
      reply(response);
    }
  }

  private collectStream(s: events.EventEmitter): Promise<string> {
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
