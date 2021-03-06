import { badImplementation, badRequest, create, notFound } from 'boom';
import { createHmac } from 'crypto';
import { inject, injectable } from 'inversify';
import { stringify } from 'querystring';

import { RequestInit, Response } from 'node-fetch';
import AuthenticationModule from '../authentication/authentication-module';
import { IFetch } from './fetch';
import { Group, Project, User, UserGroupAccessLevel } from './gitlab';
import { Logger, loggerInjectSymbol } from './logger';
import { fetchInjectSymbol } from './types';

const perfy = require('perfy');
const randomstring = require('randomstring');

export const gitBaseUrlInjectSymbol = Symbol('git-base-url');
export const gitVhostInjectSymbol = Symbol('git-vhost');
export const gitlabHostInjectSymbol = Symbol('gitlab-host');
export const gitlabPasswordSecretInjectSymbol = Symbol('git-password-secret');

const urljoin = require('url-join');

@injectable()
export class GitlabClient {
  public static injectSymbol = Symbol('gitlab-client');

  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';

  public constructor(
    @inject(gitlabHostInjectSymbol) public readonly host: string,
    @inject(gitlabPasswordSecretInjectSymbol)
    private readonly passwordSecret: string,
    @inject(fetchInjectSymbol) private readonly originalFetch: IFetch,
    @inject(AuthenticationModule.injectSymbol)
    private readonly authentication: AuthenticationModule,
    @inject(loggerInjectSymbol) public readonly logger: Logger,
    private readonly logging: boolean = false,
  ) {}

  public getUserPassword(username: string) {
    return createHmac('sha1', this.passwordSecret)
      .update(`U${username}`)
      .digest('base64');
  }

  public url(path: string) {
    return urljoin(this.host, this.apiPrefix, path);
  }

  public get rawFetch(): IFetch {
    return this.originalFetch;
  }

  private log(msg: string): void {
    if (this.logging && this.logger && this.logger.info) {
      this.logger.info(msg);
    }
  }

  public getToken() {
    return this.authentication.getRootAuthenticationToken();
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

    const token = await this.getToken();
    // Make a shallow copy
    const _options = options ? { ...options } : {};

    const headers = _options.headers as any;

    if (headers === 'object' && headers.set) {
      headers.set(key, token);
      return _options;
    }

    // tslint:disable-next-line:prefer-object-spread
    _options.headers = Object.assign({ [key]: token }, _options.headers || {});
    return _options;
  }

  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    return this.originalFetch(url, _options);
  }

  public async fetchJson<T>(
    path: string,
    options?: RequestInit,
    includeErrorPayload = false,
  ): Promise<T> {
    const timerId = this.logging ? randomstring.generate() : null;
    if (this.logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);
    const response = await this.originalFetch(url, _options);
    if (this.logging) {
      const timerResult = perfy.end(timerId);
      this.log(
        `GitlabClient: received response ${response.status} from ${url} in ${timerResult.time} secs.`,
      );
    }
    if (response.status !== 200 && response.status !== 201) {
      if (!includeErrorPayload) {
        throw create(response.status);
      }
      const json = await response.json<any>();
      throw create(response.status, undefined, json);
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
  ): Promise<{ status: number; json: T | undefined }> {
    const timerId = this.logging ? randomstring.generate() : null;
    if (this.logging) {
      perfy.start(timerId);
    }
    const url = this.url(path);
    const _options = await this.authenticate(options);
    this.log(`GitlabClient: sending request to ${url}`);

    let res: Response;
    try {
      res = await this.originalFetch(url, _options);
    } catch (err) {
      if (logErrors) {
        this.logger.error(err.message, err);
      }
      throw badImplementation();
    }

    if (this.logging) {
      const timerResult = perfy.end(timerId);
      this.log(
        `GitlabClient: received response ${res.status} from ${url} in ${timerResult.time} secs.`,
      );
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

  public async getUsers(page = 1, perPage = 100) {
    const users = await this.fetchJson<User[]>(
      `users?page=${page}&per_page=${perPage}`,
      undefined,
      true,
    );
    if (!users || !users.length) {
      return [];
    }
    return users;
  }

  public async getUserByEmailOrUsername(emailOrUsername: string) {
    const search = {
      search: emailOrUsername,
    };
    const users = await this.fetchJson<User[]>(
      `users?${stringify(search)}`,
      undefined,
      true,
    );
    if (!users || !users.length) {
      throw badRequest(`Can\'t find user '${emailOrUsername}'`);
    }
    if (users.length > 1) {
      // This shoud never happen
      const message = `Found multiple users with email or username '${emailOrUsername}'`;
      this.logger.warning(message);
      throw badRequest(message);
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
    return this.fetchJson<User>(
      `users`,
      {
        method: 'POST',
        body: JSON.stringify(newUser),
        headers: {
          'content-type': 'application/json',
        },
      },
      true,
    );
  }

  public modifyUser(
    id: number,
    changes: Partial<User> & { password?: string },
  ) {
    return this.fetchJson<User>(
      `users/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(changes),
        headers: {
          'content-type': 'application/json',
        },
      },
      true,
    );
  }

  public createGroup(
    name: string,
    path: string,
    description?: string,
    visibilityLevel: 0 | 10 | 20 = 0,
    lfsEnabled = false,
    requestAccessEnabled = false,
  ) {
    const newGroup = {
      name,
      path,
      description,
      visibility_level: visibilityLevel,
      lfs_enabled: lfsEnabled,
      request_access_enabled: requestAccessEnabled,
    };
    return this.fetchJson<Group>(
      `groups`,
      {
        method: 'POST',
        body: JSON.stringify(newGroup),
        headers: {
          'content-type': 'application/json',
        },
      },
      true,
    );
  }

  public deleteGroup(idOrPath: number | string) {
    return this.fetchJson(
      `groups/${idOrPath}`,
      {
        method: 'DELETE',
      },
      true,
    );
  }

  /**
   * Adds a user to a project or group.
   * The access levels are documented here: https://docs.gitlab.com/ce/api/members.html.
   */
  public addUserToGroup(
    userId: number,
    teamId: number,
    accessLevel = UserGroupAccessLevel.MASTER,
  ) {
    return this.fetchJson(
      `groups/${teamId}/members`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: teamId,
          user_id: userId,
          access_level: accessLevel,
        }),
        headers: {
          'content-type': 'application/json',
        },
      },
      true,
    );
  }

  public async searchGroups(search: string) {
    const groups = await this.fetchJson<Group[]>(
      `groups?${stringify({ search })}`,
      undefined,
      true,
    );
    if (!groups.length) {
      throw notFound(`No groups found matching '${search}'`);
    }
    return groups;
  }

  public async getGroup(
    groupIdOrPath: number | string,
    userIdOrName?: number | string,
  ) {
    let group: Group;
    if (userIdOrName) {
      const sudo = {
        sudo: userIdOrName,
      };
      group = await this.fetchJson<Group>(
        `groups/${groupIdOrPath}?${stringify(sudo)}`,
        undefined,
        true,
      );
    } else {
      group = await this.fetchJson<Group>(
        `groups/${groupIdOrPath}`,
        undefined,
        true,
      );
    }
    if (!group || !group.id) {
      throw notFound(`No group found with id '${groupIdOrPath}'`);
    }
    return group;
  }

  public async getUserGroups(userIdOrName: number | string) {
    const sudo = {
      sudo: userIdOrName,
    };
    return this.fetchJson<Group[]>(
      `groups?${stringify(sudo)}`,
      undefined,
      true,
    );
  }

  public async getALLGroups() {
    return this.fetchJson<Group[]>(`groups`, undefined, true);
  }

  public async getProject(projectId: number, userIdOrName?: number | string) {
    let project: Project;
    if (userIdOrName) {
      const sudo = {
        sudo: userIdOrName,
      };
      project = await this.fetchJson<Project>(
        `projects/${projectId}?${stringify(sudo)}`,
        undefined,
        true,
      );
    } else {
      project = await this.fetchJson<Project>(
        `projects/${projectId}`,
        undefined,
        true,
      );
    }
    if (!project || !project.id) {
      throw notFound(`No project found with id '${projectId}'`);
    }
    return project;
  }

  public async getUserProjects(userIdOrName: number | string) {
    const sudo = {
      sudo: userIdOrName,
    };
    return this.fetchJson<Project[]>(
      `projects?${stringify(sudo)}`,
      undefined,
      true,
    );
  }
}

export function validateEmail(email: any): email is string {
  if (typeof email !== 'string') {
    return false;
  }
  return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/.test(email);
}

export function looselyValidateEmail(email: any): email is string {
  if (typeof email !== 'string') {
    return false;
  }
  return /^.+@.+$/.test(email);
}
