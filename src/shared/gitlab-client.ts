
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
const perfy = require('perfy');
const randomstring = require('randomstring');

import Authentication from '../authentication/authentication-module';
import { Logger, loggerInjectSymbol} from '../shared/logger';

export const fetchInjectSymbol = Symbol('fetch');
export const gitlabHostInjectSymbol = Symbol('gitlab-host');

const urljoin = require('url-join');

@injectable()
export class GitlabClient {

  public static injectSymbol = Symbol('gitlab-client');

  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';

  private logger: Logger;
  private _fetch: IFetchStatic;
  private _logging: boolean;
  private _authentication: Authentication;

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetchStatic,
    @inject(Authentication.injectSymbol) auth: Authentication,
    @inject(loggerInjectSymbol) logger: Logger,
    logging: boolean = true) {
    this.host = host;
    this.logger = logger;
    this._fetch = fetch;
    this._logging = logging;
    this._authentication = auth;
  }

  public url(path: string) {
    return urljoin(this.host, this.apiPrefix, path);
  }

  public get rawFetch(): IFetchStatic {
    return this._fetch;
  }

  private log(msg: string): void {
    if (this._logging) {
      this.logger.info(msg);
    }
  }

  public async authenticate(options?: RequestInit) {

    // Is set already, no modifications
    const key = this.authenticationHeader;
    if (options
      && options.headers
      && options.headers instanceof Headers
      && options.headers.get(key) ) {
        return options;
    }

    if (options && options.headers) {
      // Is set already, no modifications
      const h = <any> options.headers;
      if (typeof h === 'object' && h[key]) {
        return options;
      }
    }

    const token = await this._authentication.getRootAuthenticationToken();
    // Make a shallow copy
    const _options = Object.assign({}, options || {});

    if (_options.headers instanceof Headers) {
      _options.headers.set(key, token);
      return _options;
    }

    _options.headers = Object.assign({[key]: token}, _options.headers || {});
    return _options;
  }

  public async fetch(path: string, options?: RequestInit): Promise<IResponse> {
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    return this._fetch(url, _options);
  }

  public async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const timerId = this._logging ? randomstring.generate() : null;
    if (this._logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    const response = await this._fetch(url, _options);
    if (response.status !== 200) {
      throw Boom.create(response.status);
    }
    if (this._logging) {
      const timerResult = perfy.end(timerId);
      this.log(`GitlabClient: received response ${response.status} from ${url} in ${timerResult.time} secs.`);
    }
    const json = await response.json<T>();
    return json;
  }

}
