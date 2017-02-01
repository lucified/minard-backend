import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';
import * as qs from 'querystring';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { Group, User } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import { charlesKnexInjectSymbol } from '../shared/types';
import { AccessToken, jwtOptionsInjectSymbol } from './types';

export interface TeamToken {
  teamId: number;
  token: string;
  createdAt: number | moment.Moment;
}

export const subEmailClaimKey: 'https://sub_email' = 'https://sub_email';
export const teamTokenClaimKey: 'https://team_token' = 'https://team_token';

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) private readonly hapiOptions: auth.JWTStrategyOptions,
    @inject(charlesKnexInjectSymbol) private readonly db: Knex,
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
        cors: true,
      },
    }]);
    next();
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const user = await getUserByEmail(credentials[subEmailClaimKey], this.gitlab);
      const teams = await getUserTeams(user.id, this.gitlab);
      return reply(teams[0]); // NOTE: we only support a single team for now
    } catch (error) {
      return reply(Boom.wrap(error, 401));
    }
  }

  public async signupHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const teamToken = credentials[teamTokenClaimKey]!;
      const teamId = await validateTeamToken(teamToken, this.db);
      const team = await this.gitlab.fetchJson<Group>(`groups/${teamId}`);
      const email = credentials[subEmailClaimKey];
      const {id, idp} = parseSub(credentials.sub);
      const user = await createUser(
        email,
        '12345678',
        email.replace('@', '-'),
        email,
        this.gitlab,
        id,
        idp,
      );
      await addUserToGroup(user.id, teamId, this.gitlab);
      return reply(team);
    } catch (error) {
      return reply(Boom.wrap(error, 401));
    }
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
      ...this.hapiOptions,
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
  const users = await gitlab.fetchJson<User[]>(`users?${qs.stringify(search)}`, true);
  if (!users || !users.length) {
    throw Boom.badRequest(`Can\'t find user '${email}'`);
  }
  if (users.length > 1) {
    // This shoud never happen
    throw Boom.badRequest(`Found multiple users with email '${email}'`);
  }
  return users[0];
}

export function createUser(
  email: string,
  password: string,
  username: string,
  name: string,
  gitlab: GitlabClient,
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
  return gitlab.fetchJson<User>(`users`, {
    method: 'POST',
    body: JSON.stringify(newUser),
    headers: {
      'content-type': 'application/json',
    },
  }, true);
}

export function addUserToGroup(userId: number, teamId: number, gitlab: GitlabClient, accessLevel = 30) {
  return gitlab.fetchJson(`groups/${teamId}/members`, {
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

export async function getUserTeams(userId: number, gitlab: GitlabClient) {
  const sudo = {
    sudo: userId,
  };
  return gitlab.fetchJson<Group[]>(`groups?${qs.stringify(sudo)}`, true);
}

export function teamTokenQuery(token: string, db: Knex) {
  if (!token || token.length !== 7 || !token.match(/^\w+$/)) {
    throw new Error('Invalid team token');
  }
  const latestTokens = db('teamtoken')
    .select(db.raw('teamId, MAX(createdAt) as latestStamp'))
    .groupBy('teamId')
    .as('latest');
  return db('teamtoken')
    .join(latestTokens, ((join: any) => join
      .on('teamtoken.teamId', '=', 'latest.teamId')
      .andOn('teamtoken.createdAt', '=', 'latest.latestStamp')) as any,
    )
    .where('teamtoken.token', token);
}

export async function validateTeamToken(token: string, db: Knex) {
  const teamTokens: TeamToken[] = await teamTokenQuery(token, db);
  if (!teamTokens || teamTokens.length !== 1) {
    throw new Error('Invalid team token');
  }
  return teamTokens[0].teamId;
}
