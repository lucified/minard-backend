import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as Knex from 'knex';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { Group } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { adminTeamNameInjectSymbol, charlesKnexInjectSymbol } from '../shared/types';
import { generateTeamToken, TeamToken, teamTokenQuery, validateTeamToken } from './team-token';
import { AccessToken, jwtOptionsInjectSymbol } from './types';

const randomstring = require('randomstring');

export const subEmailClaimKey: 'https://sub_email' = 'https://sub_email';
export const teamTokenClaimKey: 'https://team_token' = 'https://team_token';

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) private readonly hapiOptions: auth.JWTStrategyOptions,
    @inject(charlesKnexInjectSymbol) private readonly db: Knex,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(adminTeamNameInjectSymbol) private readonly adminTeamName: string,
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
    server.route([{
      method: 'GET',
      path: '/signup',
      handler: {
        async: this.signupHandler,
      },
      config: {
        bind: this,
      },
    }]);
    server.route({
      method: 'GET',
      path: '/team-token/{teamId}',
      handler: {
        async: this.getTeamTokenHandler,
      },
      config: {
        bind: this,
        auth: 'admin',
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    });
    server.route({
      method: 'POST',
      path: '/team-token/{teamId}',
      handler: {
        async: this.createTeamTokenHandler,
      },
      config: {
        bind: this,
        auth: 'admin',
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    });
    next();
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const user = await this.gitlab.getUserByEmail(credentials[subEmailClaimKey]);
      const teams = await this.gitlab.getUserTeams(user.id);
      return reply(teams[0]); // NOTE: we only support a single team for now
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
      return reply(Boom.wrap(error, 401));
    }
  }

  public async getTeamTokenHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.paramsArray[0], 10);
      const teamToken: TeamToken[] = await teamTokenQuery(this.db, undefined, teamId);
      if (!teamToken.length) {
        throw new Error(`No token found for team ${teamId}`);
      }
      return reply(teamToken[0]);
    } catch (error) {
      return reply(Boom.notFound(error.message));
    }
  }

  public async createTeamTokenHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.paramsArray[0], 10);
      const teamToken = await generateTeamToken(teamId, this.db);
      return reply(teamToken).code(201);
    } catch (error) {
      return reply(Boom.badRequest(error.message));
    }
  }

  public async signupHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const teamToken = credentials[teamTokenClaimKey]!;
      const teamId = await validateTeamToken(teamToken, this.db);
      const team = await this.gitlab.fetchJson<Group>(`groups/${teamId}`);
      const email = credentials[subEmailClaimKey];
      const password = generatePassword();
      const {id, idp} = parseSub(credentials.sub);
      const user = await this.gitlab.createUser(
        email,
        password,
        email.replace('@', '-'),
        email,
        id,
        idp,
      );
      await this.gitlab.addUserToGroup(user.id, teamId);
      return reply({
        team,
        password,
      });
    } catch (error) {
      this.logger.error(`Problems on signup`, error);
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

  public async validateAdmin(
    payload: AccessToken,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    let valid = false;
    try {
      const credentials = payload;
      const user = await this.gitlab.getUserByEmail(credentials[subEmailClaimKey]);
      const teams = await this.gitlab.getUserTeams(user.id);
      valid = teams.reduce((previous, current) =>
        current.name.toLowerCase() === this.adminTeamName ? true : previous, false,
      );
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
    }
    callback(undefined, valid, payload);
  }

  public async registerAuth(server: Hapi.Server) {
    await server.register(auth);
    server.auth.strategy('jwt', 'jwt', true, {
      ...this.hapiOptions,
      validateFunc: this.validateUser.bind(this),
    });
    server.auth.strategy('admin', 'jwt', false, {
      ...this.hapiOptions,
      validateFunc: this.validateAdmin.bind(this),
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

export function generatePassword(length = 16) {
  return randomstring.generate({length, charset: 'alphanumeric', readable: true});
}
