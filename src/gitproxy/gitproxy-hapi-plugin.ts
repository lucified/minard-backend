import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { STRATEGY_GIT } from '../authentication/types';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { gitlabHostInjectSymbol, gitVhostInjectSymbol } from '../shared/gitlab-client';
import * as logger from '../shared/logger';

@injectable()
export class GitProxy extends HapiPlugin {
  public static readonly injectSymbol = Symbol('git-proxy');

  public constructor(
    @inject(gitlabHostInjectSymbol) private readonly gitlabHost: string,
    @inject(gitVhostInjectSymbol) private readonly gitVhost: string,
    @inject(logger.loggerInjectSymbol) private readonly logger: logger.Logger,
  ) {
    super({
      name: 'gitproxy',
      version: '1.0.0',
    });
    this.onRequestHandler = this.onRequestHandler.bind(this);
  }

  public register(
    server: Hapi.Server,
    _options: Hapi.IServerOptions,
    next: () => void,
  ) {
    server.route({
      method: '*',
      path: '/{path*}',
      vhost: this.gitVhost,
      handler: {
        proxy: {
          passThrough: true,
          mapUri: this.onRequestHandler,
        },
      },
      config: {
        bind: this,
        auth: STRATEGY_GIT,
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    next();
  }

  public onRequestHandler(
    request: Hapi.Request,
    callback: (
      err: any,
      uri: string,
      headers?: { [key: string]: string },
    ) => void,
  ) {
    const { path } = request.url;
    const uri = `${this.gitlabHost}${path}`;
    try {
      const { headers } = request;
      const basic = new Buffer(`${request.auth.credentials.username}:12345678`).toString('base64');
      return callback(undefined, uri, {
        ...headers,
        authorization: `Basic ${basic}`,
      });
    } catch (_error) {
      this.logger.debug(`Invalid Git request: ${_error.message}`);
      const error = _error.isBoom ? _error : Boom.create(_error.statusCode || 401, _error.description);
      return callback(error, uri, {});
    }
  }

  // public onReplyHandler(
  //   err: any,
  //   response: http.IncomingMessage,  // note that this is incorrect in the hapi type def
  //   request: Hapi.Request,
  //   reply: Hapi.IReply,
  // ) {

  //   if (err) {
  //     return reply(err);
  //   }
  //   const req = `\n> ${request.method.toUpperCase()} ${request.url.href}`;
  //   const headers = Object.entries(request.headers)
  //     .reduce((acc, [key, value]: [string, string]) => acc + `> ${key}: ${value}\n`, '');
  //   request.log('proxy', [req, headers].join(`\n`));
  //   // const body = await this.collectStream(response);
  //   // console.log(body);
  //   return reply(response);
  // }

  // public collectStream(s: events.EventEmitter): Promise<string> {
  //   if (!s || !s.on) {
  //     throw new Error('s is not an EventEmitter');
  //   }
  //   const body: Buffer[] = [];
  //   return new Promise((resolve, reject) => {
  //     s
  //       .on('error', (err: any) => {
  //         reject(err);
  //       })
  //       .on('data', (chunk: Buffer) => {
  //         body.push(chunk);
  //       })
  //       .on('end', () => {
  //         resolve(Buffer.concat(body).toString());
  //       });
  //   });
  // }
}
