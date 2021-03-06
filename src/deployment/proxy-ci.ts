import { EventEmitter } from 'events';
import { ProxyHandlerOptions } from 'h2o2';
import { IncomingMessage } from 'http';
import { inject, injectable } from 'inversify';
import { parse } from 'url';

import { STRATEGY_INTERNAL_REQUEST } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus';
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import { isBuildStatus } from '../shared/gitlab';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import {
  BuildCreatedEvent,
  createBuildCreatedEvent,
  createBuildStatusEvent,
} from './types';

@injectable()
export class CIProxy {
  public static readonly injectSymbol = Symbol('ci-proxy');
  private gitlabHost: string;
  private proxyOptions: ProxyHandlerOptions;
  public readonly routeNamespace = '/ci/api/v1/';
  public readonly routePath = this.routeNamespace + '{what}/{id}/{action?}';

  public constructor(
    @inject(gitlabHostInjectSymbol) gitlabHost: string,
    @inject(eventBusInjectSymbol) private eventBus: EventBus,
    @inject(loggerInjectSymbol) private logger: Logger,
  ) {
    this.gitlabHost = gitlabHost;
    const gitlab = parse(gitlabHost);

    if (!gitlab.hostname) {
      throw new Error('Malformed gitlab baseurl: ' + gitlabHost);
    }

    this.proxyOptions = {
      host: gitlab.hostname,
      port: gitlab.port ? parseInt(gitlab.port, 10) : 80,
      protocol: gitlab.protocol === 'https' ? 'https' : 'http',
      passThrough: true,
    };

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'ciproxy-plugin',
        version: '1.0.0',
      },
    });
  }

  private _register(
    server: Hapi.Server,
    _options: Hapi.ServerOptions,
    next: () => void,
  ) {
    server.route({
      method: '*',
      path: this.routeNamespace + '{path*}',
      handler: {
        proxy: this.proxyOptions,
      },
      config: {
        bind: this,
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    server.route({
      method: 'PUT',
      path: this.routeNamespace + 'builds/{id}',
      handler: this.putRequestHandler,
      config: {
        bind: this,
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    server.route({
      method: 'POST',
      path: this.routeNamespace + '{entities}/register.json',
      handler: {
        proxy: { ...this.proxyOptions, onResponse: this.postReplyHandler },
      },
      config: {
        bind: this,
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    next();
  }

  public readonly register: HapiRegister;

  private putRequestHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
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
    if (isBuildStatus(status)) {
      const event = createBuildStatusEvent({
        deploymentId,
        status,
      });
      this.eventBus.post(event);
      return event;
    } else {
      this.logger.warn(
        `Unknown deployment status ${status} for deployment ${deploymentId}. Not posting build status event.`,
      );
    }
    return undefined;
  }

  private postReplyHandler(
    err: any,
    response: IncomingMessage, // note that this is incorrect in the hapi type def
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
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

  private deploymentCreatedHandler(
    response: IncomingMessage,
    reply: Hapi.ReplyNoContinue,
  ) {
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

  private runnerRegisteredHandler(
    response: IncomingMessage,
    reply: Hapi.ReplyNoContinue,
  ) {
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

  private collectStream(s: EventEmitter): Promise<string> {
    if (!s || !s.on) {
      throw new Error('s is not an EventEmitter');
    }
    const body: Buffer[] = [];
    return new Promise((resolve, reject) => {
      s
        .on('error', (err: any) => {
          reject(err);
        })
        .on('data', (chunk: Buffer) => {
          body.push(chunk);
        })
        .on('end', () => {
          resolve(Buffer.concat(body).toString());
        });
    });
  }
}
