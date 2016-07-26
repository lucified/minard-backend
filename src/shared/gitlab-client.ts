
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

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetchStatic) {
    this.host = host;
    this._fetch = fetch;
  }

  // TODO: check that dashes match
  public url(path: string) {
    return `${this.host}${this.apiPrefix}/${path}`
  }

  public get rawFetch() : IFetchStatic {
    return this._fetch;
  }


  public fetch<T>(path:string, options?: RequestInit): Promise<T|void> {
    return this._fetch(this.url(path), options)
      .then(r => {
        if(r.status !== 200) {
          console.log("GitlabClient: got status ${r.status} for ${path}")
          throw new Error("Invalid status")
        }
        return r.json().then(x => x as T);
      })
      .catch(err => {
        console.log(err);
      })
  }
}