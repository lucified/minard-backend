
import Authentication from '../authentication/authentication-module';

import { inject, injectable } from 'inversify';

export const fetchInjectSymbol = Symbol('fetch');
export const gitlabHostInjectSymbol = Symbol('gitlab-host');

const urljoin = require('url-join');

@injectable()
export class GitlabClient {

  public static injectSymbol = Symbol('gitlab-client');

  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';

  private _fetch: IFetchStatic;
  private _logging: boolean;
  private _authentication: Authentication;

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetchStatic,
    @inject(Authentication.injectSymbol) auth: Authentication,
    logging: boolean = false) {

    this.host = host;
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
      console.log(msg);
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
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    const r = await this._fetch(url, _options);
    if (r.status !== 200) {
      throw new HttpError(r);
    }
    this.log(`GitlabClient: received response ${r.status} from ${url}`);
    return await r.json<T>();
  }

}

export class HttpError extends Error {
    public readonly response: IResponse;
    public readonly message: string;

    constructor(response: IResponse, msg?: string) {
      super();
      this.response = response;
      this.stack = new Error().stack;
      this.message = msg ? msg : `Received ${response.status}: ${response.statusText}`;
    }
}
