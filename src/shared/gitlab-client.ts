
import { IFetchStatic, RequestInit } from './fetch.d.ts';
import { inject, injectable } from 'inversify';

export const fetchInjectSymbol = Symbol('fetch');
export const gitlabHostInjectSymbol = Symbol('gitlab-host');

@injectable()
export class GitlabClient {
  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';

  public static injectSymbol = Symbol('gitlab-client');

  private _fetch: IFetchStatic;
  private _logging: boolean;

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetchStatic,
    logging: boolean = false) {

    this.host = host;
    this._fetch = fetch;
    this._logging = logging;
  }

  // TODO: check that dashes match
  public url(path: string) {
    return `${this.host}${this.apiPrefix}/${path}`
  }

  public get rawFetch() : IFetchStatic {
    return this._fetch;
  }

  private log(msg: string):void {
    if(this._logging)
      console.log(msg);
  }

  public async fetch<T>(path:string, options?: RequestInit): Promise<T> {

    const url = this.url(path);
    this.log(`GitlabClient: sending request to ${url}`);
    const r = await this._fetch(url, options);
    this.log(`GitlabClient: received response ${r.status} from ${url}`);
    return await r.json<T>();

  }
}