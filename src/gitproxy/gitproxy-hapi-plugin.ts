import { create } from 'boom';
import { inject, injectable } from 'inversify';

import { STRATEGY_GIT } from '../authentication/types';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import {
  gitlabHostInjectSymbol,
  gitVhostInjectSymbol,
} from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';

@injectable()
export class GitProxy extends HapiPlugin {
  public static readonly injectSymbol = Symbol('git-proxy');

  public constructor(
    @inject(gitlabHostInjectSymbol) private readonly gitlabHost: string,
    @inject(gitVhostInjectSymbol) private readonly gitVhost: string,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {
    super({
      name: 'gitproxy',
      version: '1.0.0',
    });
    this.onRequestHandler = this.onRequestHandler.bind(this);
  }

  public register(
    server: Hapi.Server,
    _options: Hapi.ServerOptions,
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
      const { username, gitlabPassword } = request.auth.credentials;
      const basic = new Buffer(`${username}:${gitlabPassword}`).toString(
        'base64',
      );
      return callback(undefined, uri, {
        ...headers,
        authorization: `Basic ${basic}`,
      });
    } catch (_error) {
      this.logger.debug(`Invalid Git request: ${_error.message}`);
      const error = _error.isBoom
        ? _error
        : create(_error.statusCode || 401, _error.description);
      return callback(error, uri, {});
    }
  }
}
