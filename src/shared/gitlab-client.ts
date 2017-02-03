
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as qs from 'querystring';

import AuthenticationModule from '../authentication/authentication-module';
import { IFetch, RequestInit, Response } from './fetch';
import { Group, User } from './gitlab';
import { Logger, loggerInjectSymbol } from './logger';
import { fetchInjectSymbol } from './types';

const perfy = require('perfy');
const randomstring = require('randomstring');

export const gitBaseUrlInjectSymbol = Symbol('git-base-url');
export const gitlabHostInjectSymbol = Symbol('gitlab-host');

const urljoin = require('url-join');

@injectable()
export class GitlabClient {

  public static injectSymbol = Symbol('gitlab-client');

  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';
  public readonly logger: Logger;

  private _fetch: IFetch;
  private _logging: boolean;
  private _authentication: AuthenticationModule;

  public constructor(
    @inject(gitlabHostInjectSymbol) host: string,
    @inject(fetchInjectSymbol) fetch: IFetch,
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

  public get rawFetch(): IFetch {
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
    if (options && typeof options.headers === 'object') {
      const headers = options.headers as any;
      if ((headers.get && headers.get(key)) || headers[key]) {
        return options;
      }
    }

    const token = await this._authentication.getRootAuthenticationToken();
    // Make a shallow copy
    const _options = Object.assign({}, options || {});

    const headers = _options.headers as any;

    if (headers === 'object' && headers.set) {
      headers.set(key, token);
      return _options;
    }

    _options.headers = Object.assign({ [key]: token }, _options.headers || {});
    return _options;
  }

  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    return this._fetch(url, _options);
  }

  public async fetchJson<T>(path: string, options?: RequestInit, includeErrorPayload = false): Promise<T> {
    const timerId = this._logging ? randomstring.generate() : null;
    if (this._logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    const response = await this._fetch(url, _options);
    if (response.status !== 200 && response.status !== 201) {
      if (!includeErrorPayload) {
        throw Boom.create(response.status);
      }
      const json = await response.json<any>();
      throw Boom.create(response.status, undefined, json);
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
    logErrors: boolean = true,
  ): Promise<{ status: number, json: T | undefined }> {
    const timerId = this._logging ? randomstring.generate() : null;
    if (this._logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);

    let res: Response;
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

  public async getUserByEmail(email: string) {
    const search = {
      search: email,
    };
    const users = await this.fetchJson<User[]>(`users?${qs.stringify(search)}`, true);
    if (!users || !users.length) {
      throw Boom.badRequest(`Can\'t find user '${email}'`);
    }
    if (users.length > 1) {
      // This shoud never happen
      throw Boom.badRequest(`Found multiple users with email '${email}'`);
    }
    return users[0];
  }

  public createUser(
    email: string,
    password: string,
    username: string,
    name: string,
    externUid?: string,
    provider?: string,
    confirm = false,
  ) {
    const newUser = {
      email,
      password,
      username,
      name,
      extern_uid: externUid,
      provider,
      confirm,
    };
    return this.fetchJson<User>(`users`, {
      method: 'POST',
      body: JSON.stringify(newUser),
      headers: {
        'content-type': 'application/json',
      },
    }, true);
  }

  public addUserToGroup(userId: number, teamId: number, accessLevel = 30) {
    return this.fetchJson(`groups/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        id: teamId,
        user_id: userId,
        access_level: accessLevel,
      }),
      headers: {
        'content-type': 'application/json',
      },
    }, true);
  }

  public async getUserTeams(userId: number) {
    const sudo = {
      sudo: userId,
    };
    return this.fetchJson<Group[]>(`groups?${qs.stringify(sudo)}`, true);
  }

}
