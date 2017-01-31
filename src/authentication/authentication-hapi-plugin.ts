import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as qs from 'querystring';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { Group, User } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import { AccessToken, jwtOptionsInjectSymbol } from './types';

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');
  private readonly subEmailClaimKey: 'https://sub_email' = 'https://sub_email';

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) private readonly options: auth.JWTStrategyOptions,
  ) {
    super({
      name: 'authentication-plugin',
      version: '1.0.0',
    });
  }

  public async register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    await this.registerAuth(server);
    server.route([{
      method: 'GET',
      path: '/team',
      handler: {
        async: this.getTeamHandler,
      },
      config: {
        bind: this,
      },
    }]);
    next();
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const credentials = request.auth.credentials as AccessToken;
    const user = await getUserByEmail(credentials[this.subEmailClaimKey], this.gitlab);
    const teams = getUserTeams(user.id, this.gitlab);
    return reply(teams);
  }

  public async validateUser(
    payload: AccessToken,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    // NOTE: we have just a single team at this point so no further checks are necessary
    callback(undefined, true, payload);
  }

  public async registerAuth(server: Hapi.Server) {
    await server.register(auth);
    server.auth.strategy('jwt', 'jwt', true, {
      ...this.options,
      validateFunc: this.validateUser.bind(this),
    });
  }
}

export default AuthenticationHapiPlugin;

export function parseSub(sub: string) {
  if (typeof sub !== 'string') {
    throw new Error('Invalid \'sub\' claim.');
  }
  const parts = sub.split('|');
  if (parts.length !== 2) {
    throw new Error('Invalid \'sub\' claim.');
  }
  return {
    id: parts[1],
    idp: parts[0],
  };
}

export async function getUserByEmail(email: string, gitlab: GitlabClient) {
  const search = {
    search: email,
  };
  const users = await gitlab.fetchJson<User[]>(`users?${qs.stringify(search)}`);
  if (!users || !users.length) {
    throw Boom.badRequest(`Can\'t find user '${email}'`);
  }
  if (users.length > 1) {
    // This shoud never happen
    throw Boom.badRequest(`Found multiple users with email '${email}'`);
  }
  return users[0];
}

export async function getUserTeams(userId: number, gitlab: GitlabClient) {
  const sudo = {
    sudo: userId,
  };
  return gitlab.fetchJson<Group[]>(`groups?${qs.stringify(sudo)}`);
}
