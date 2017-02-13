import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as Knex from 'knex';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { IFetch } from '../shared/fetch';
import { GitlabClient, validateEmail } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { adminTeamNameInjectSymbol, charlesKnexInjectSymbol, fetchInjectSymbol } from '../shared/types';
import { generateAndSaveTeamToken, getTeamIdWithToken, TeamToken, teamTokenQuery } from './team-token';
import { AccessToken, jwtOptionsInjectSymbol, teamTokenClaimKey } from './types';

const randomstring = require('randomstring');

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) private readonly hapiOptions: auth.JWTStrategyOptions,
    @inject(charlesKnexInjectSymbol) private readonly db: Knex,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(adminTeamNameInjectSymbol) private readonly adminTeamName: string,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
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
      const user = await this.gitlab.getUserByEmailOrUsername(credentials.sub);
      const teams = await this.gitlab.getUserGroups(user.id);
      return reply(teams[0]); // NOTE: we only support a single team for now
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
      return reply(Boom.wrap(error, 404));
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
      const teamToken = await generateAndSaveTeamToken(teamId, this.db);
      return reply(teamToken).code(201);
    } catch (error) {
      return reply(Boom.badRequest(error.message));
    }
  }

  public async signupHandler(request: Hapi.Request, reply: Hapi.IReply) {
    let email: string | undefined;
    let credentials: AccessToken | undefined;
    try {
      credentials = request.auth.credentials as AccessToken;
      email = credentials.email;
      if (!validateEmail(email)) {
        // Fall back to fetching the email from Auth0
        email = await this.tryGetEmailFromAuth0((request.auth as any).token);
      }
      if (!validateEmail(email)) {
        throw new Error(`Invalid email ${email}`);
      }
      const teamToken = credentials[teamTokenClaimKey]!;
      const teamId = await getTeamIdWithToken(teamToken, this.db);
      const team = await this.gitlab.getGroup(teamId);
      const password = generatePassword();
      const {id, idp} = parseSub(credentials.sub);
      const user = await this.gitlab.createUser(
        email,
        password,
        credentials.sub,
        email,
        id,
        idp,
      );
      await this.gitlab.addUserToGroup(user.id, teamId);
      return reply({
        team,
        password,
      }).code(201); // created
    } catch (error) {
      const message = `Problems on signup for user ${email}`;
      this.logger.error(message, {
        error,
        credentials,
      });
      return reply(Boom.badRequest(message));
    }
  }

  public async validateUser(
    payload: AccessToken,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    // NOTE: we have just a single team at this point so no further checks are necessary
    callback(undefined, validateSub(payload.sub));
  }

  public async validateAdmin(
    payload: AccessToken,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    let validTeam = false;
    try {
      if (validateSub(payload.sub)) {
        const user = await this.gitlab.getUserByEmailOrUsername(payload.sub);
        const teams = await this.gitlab.getUserGroups(user.id);
        validTeam = teams.find(team => team.name.toLowerCase() === this.adminTeamName) !== undefined;
      }
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
    }
    callback(undefined, validTeam, payload);
  }

  private async tryGetEmailFromAuth0(accessToken: string) {
    // We assume that if the issuer is defined, it's the Auth0 baseUrl
    let email: string | undefined;
    if (this.hapiOptions.verifyOptions && this.hapiOptions.verifyOptions.issuer) {
      const userInfo = await getAuth0UserInfo(this.hapiOptions.verifyOptions.issuer, accessToken, this.fetch);
      if (validateEmail(userInfo.email)) {
        email = userInfo.email;
      // the email can actually be in the name field depending on the identity provider
      } else if (validateEmail(userInfo.name)) {
        email = userInfo.name;
      }
    }
    return email;
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
  if (!validateSub(sub)) {
    throw new Error('Invalid \'sub\' claim.');
  }
  const parts = sub.split('|');
  return {
    id: parts[1],
    idp: parts[0],
  };
}

export function validateSub(sub: string) {
  if (typeof sub !== 'string') {
    return false;
  }
  const parts = sub.split('|');
  if (parts.length !== 2) {
    return false;
  }
  return true;
}

export async function getAuth0UserInfo(auth0Domain: string, accessToken: string, fetch: IFetch) {
  const baseUrl = auth0Domain.replace(/\/$/, '');
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  };
  const response = await fetch(`${baseUrl}/userinfo`, options);
  return await response.json();
}

export function generatePassword(length = 16) {
  return randomstring.generate({ length, charset: 'alphanumeric', readable: true }) as string;
}
