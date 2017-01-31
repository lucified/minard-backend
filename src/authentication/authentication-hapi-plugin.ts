
import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as qs from 'querystring';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { Group, User } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import {default as AuthenticationModule} from './authentication-module';
import { AccessToken, authServerBaseUrlInjectSymbol, jwtOptionsInjectSymbol } from './types';

interface UserId {
  id: string;
  idp: string;
}

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');
  private readonly authenticationModule: AuthenticationModule;
  private readonly authServerBaseUrl: string;
  private readonly logger: Logger;
  private readonly gitlab: GitlabClient;
  private readonly options: auth.JWTStrategyOptions;
  private teamTokenClaimKey: 'https://team_token' = 'https://team_token';
  private subEmailClaimKey: 'https://sub_email' = 'https://sub_email';

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(authServerBaseUrlInjectSymbol) authServerBaseUrl: string,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) jwtOptions: auth.JWTStrategyOptions,
    ) {
    super({
      name: 'authentication-plugin',
      version: '1.0.0',
    });
    this.authenticationModule = authenticationModule;
    this.authServerBaseUrl = authServerBaseUrl;
    this.logger = logger;
    this.gitlab = gitlab;
    this.options = jwtOptions;
  }

  public async register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    await this.registerAuth(server);
    server.route([{
      method: 'GET',
      path: '/signup/{teamToken}',
      handler: {
        async: this.signupHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            teamToken: Joi.string().alphanum().length(8),
          },
        },
      },
    },
    ]);
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

  public async signupHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const credentials = request.auth.credentials as AccessToken;
    const teamToken = credentials[this.teamTokenClaimKey];

    reply(teamToken);
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const credentials = request.auth.credentials as AccessToken;
    const user = await getUserByEmail(credentials[this.subEmailClaimKey], this.gitlab);
    const teams = getUserTeams(user.id, this.gitlab);
    return reply(teams);
  }

  public async signToTeam(_uid: UserId, teamToken: string) {
    return teamToken;
  }

  public async getTeam(uid: UserId) {
    return uid.idp;
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
  if (!users || !users.length || users.length > 1) {
    throw Boom.badRequest(`Can\'t find user '${email}'`);
  }
  return users[0];
}

export async function getUserTeams(userId: number, gitlab: GitlabClient) {
  const sudo = {
    sudo: userId,
  };
  return gitlab.fetchJson<Group[]>(`groups?${qs.stringify(sudo)}`);
}
