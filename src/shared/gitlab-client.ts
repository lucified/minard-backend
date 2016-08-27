
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { AuthenticationModule } from '../authentication';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';

const perfy = require('perfy');
const randomstring = require('randomstring');

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
  private _authentication: AuthenticationModule;

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetchStatic,
    @inject(AuthenticationModule.injectSymbol) auth: AuthenticationModule,
    @inject(loggerInjectSymbol) logger: Logger,
    logging: boolean = false) {
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
    if (response.status !== 200 && response.status !== 201) {
      throw Boom.create(response.status);
    }
    if (this._logging) {
      const timerResult = perfy.end(timerId);
      this.log(`GitlabClient: received response ${response.status} from ${url} in ${timerResult.time} secs.`);
    }
    const json = await response.json<T>();
    return json;
  }

  /*
   * Fetch json and try to parse it regardless of status code
   */
  public async fetchJsonAnyStatus<T>(
    path: string,
    options?: RequestInit,
    logErrors: boolean = true
    ): Promise<{status: number, json: T | undefined}> {
    const timerId = this._logging ? randomstring.generate() : null;
    if (this._logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);

    let res: IResponse;
    try {
      res = await this._fetch(url, _options);
    } catch (err) {
      if (logErrors) { this.logger.error(err.message, err); }
      throw Boom.badImplementation();
    }

    if (this._logging) {
      const timerResult = perfy.end(timerId);
      this.log(`GitlabClient: received response ${res.status} from ${url} in ${timerResult.time} secs.`);
    }

    let json: T | undefined;
    try {
      json = await res.json();
    } catch (err) {
      json = undefined;
    }
    return {
      status: res.status,
      json,
    };
  }

}
