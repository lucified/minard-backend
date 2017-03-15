import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { parseApiBranchId } from '../json-api/conversions';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { IFetch } from '../shared/fetch';
import { Group } from '../shared/gitlab';
import { GitlabClient, validateEmail } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { adminTeamNameInjectSymbol, charlesKnexInjectSymbol, fetchInjectSymbol } from '../shared/types';
import { generateAndSaveTeamToken, getTeamIdWithToken, teamTokenQuery } from './team-token';
import { AccessToken, authCookieDomainInjectSymbol, jwtOptionsInjectSymbol, teamTokenClaimKey } from './types';

const randomstring = require('randomstring');
const teamIdOrNameKey = 'teamIdOrName';

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) private readonly hapiOptions: auth.JWTStrategyOptions,
    @inject(authCookieDomainInjectSymbol) private readonly authCookieDomain: string,
    @inject(charlesKnexInjectSymbol) private readonly db: Knex,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(adminTeamNameInjectSymbol) private readonly adminTeamName: string,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
  ) {
    super({
      name: 'authentication-plugin',
      version: '1.0.0',
    });
    this.registerNoop = Object.assign(this.registerNoop.bind(this), {
      attributes: {
        name: 'authentication-plugin',
        version: '1.0.0',
      },
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
        auth: 'customAuthorize',
        cors: {
          credentials: true,
        },
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
        auth: 'customAuthorize',
        cors: {
          credentials: true,
        },
      },
    }]);
    server.route({
      method: 'GET',
      path: '/team-token/{teamIdOrName?}',
      handler: {
        async: this.getTeamTokenHandler,
      },
      config: {
        bind: this,
        auth: 'customAuthorize',
      },
    });
    server.route({
      method: 'POST',
      path: '/team-token/{teamIdOrName}',
      handler: {
        async: this.createTeamTokenHandler,
      },
      config: {
        bind: this,
        auth: 'admin',
      },
    });

    const decorate = server.decorate.bind(server);
    decorate('request', 'gitlab', this.gitlab);
    next();
  }

  // For use in unit tests
  public async registerNoop(server: Hapi.Server, _opt: Hapi.IServerOptions, next: () => void) {
    const testUsername = 'auth-123';
    server.auth.scheme('noop', (_server: Hapi.Server, _options: any) => {
      return {
        authenticate: (_request: Hapi.Request, reply: Hapi.IReply) => {
          return reply.continue({ credentials: { username: testUsername } });
        },
      };
    });
    server.auth.strategy('customAuthorize', 'noop', false);
    server.auth.strategy('admin', 'noop', false);
    const decorate = server.decorate.bind(server);
    decorate('request', 'gitlab', this.gitlab);
    next();
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const teams = await this.gitlab.getUserGroups(sanitizeUsername(credentials.sub));
      this.setAuthCookie(request, reply);
      return reply(teams[0]); // NOTE: we only support a single team for now
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
      return reply(Boom.wrap(error, 404));
    }
  }

  /**
   * Allows fetching a team-token for a team that:
   *  1. An authenticated user belongs to
   *  2. An admin user has specified in the request by a team's id or name
   */
  public async getTeamTokenHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const userName = sanitizeUsername(credentials.sub);
      const isAdmin = await this.isAdmin(userName);
      const userTeams = await this.gitlab.getUserGroups(userName);
      const teamIdOrName = request.params[teamIdOrNameKey];

      let requestedOwnTeam: Group | undefined;
      if (userTeams.length && teamIdOrName) {
        requestedOwnTeam = userTeams.find(findTeamByIdOrName(teamIdOrName));
      }

      let teamId: number | undefined;

      if (requestedOwnTeam) { // a request for a team that the user belongs to
        teamId = requestedOwnTeam.id;
      } else if (isAdmin && teamIdOrName) { // An admin can get any team's token
        teamId = await this.teamIdOrNameToTeamId(teamIdOrName);
      } else if (!teamIdOrName) { // no specific team requested, try to return one anyway
        if (!userTeams.length) {
          throw Error(`User ${userName} is not in any team`);
        }
        if (userTeams.length > 1) {
          throw Error(`User ${userName} is in multiple teams`);
        }
        // NOTE: we only support a single team for now
        teamId = userTeams[0].id;
      } else {
        return reply(Boom.create(401, `Insufficient privileges`));
      }
      const teamToken = await teamTokenQuery(this.db, undefined, teamId);
      if (!teamToken || !teamToken.length) {
        throw new Error(`No token found for team ${teamId}`);
      }
      return reply(teamToken[0]);
    } catch (error) {
      return reply(Boom.notFound(error.message));
    }
  }

  public async createTeamTokenHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamIdOrName = request.params[teamIdOrNameKey];
      const teamId = await this.teamIdOrNameToTeamId(teamIdOrName);
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
      const teamToken = credentials[teamTokenClaimKey];
      if (!teamToken) {
        throw new Error('Missing team token');
      }
      const teamId = await getTeamIdWithToken(teamToken, this.db);
      const team = await this.gitlab.getGroup(teamId);
      const password = generatePassword();
      const { id, idp } = parseSub(credentials.sub);
      const user = await this.gitlab.createUser(
        email,
        password,
        sanitizeUsername(credentials.sub),
        email,
        id,
        idp,
      );
      await this.gitlab.addUserToGroup(user.id, teamId);
      this.setAuthCookie(request, reply);
      return reply({
        team,
        password,
      }).code(201); // created
    } catch (error) {
      const message = `Unable to sign up user ${email}: ${error.isBoom &&
        (error.output.payload.message || error.data.message) || error.message}`;
      this.logger.error(message, credentials);
      return reply(Boom.badRequest(message));
    }
  }

  public async authorizeUser(
    payload: AccessToken,
    request: Hapi.Request,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    let isAdmin = false;
    let isAuthorized = false;
    try {
      if (assertSub(payload.sub)) {
        const userName = sanitizeUsername(payload.sub);
        isAdmin = await this.isAdmin(userName);
        if (!isAdmin) {
          isAuthorized = await authorize(this.gitlab)(userName, request);
        }
      }
    } catch (error) {
      this.logger.error('Authorization error', error);
    }
    return callback(undefined, isAdmin || isAuthorized, payload);
  }

  public authorizeCustom(
    payload: AccessToken,
    _request: Hapi.Request,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    let isValid = false;
    try {
      if (assertSub(payload.sub)) {
        payload.username = sanitizeUsername(payload.sub);
        isValid = true;
      }
    } catch (error) {
      this.logger.error('Authorization error', error);
    }
    return callback(undefined, isValid, payload);
  }

  public async authorizeAdmin(
    payload: AccessToken,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    let isAdmin = false;
    try {
      if (assertSub(payload.sub)) {
        isAdmin = await this.isAdmin(sanitizeUsername(payload.sub), true);
      }
    } catch (error) {
      this.logger.error('Authorization error', error);
    }
    callback(undefined, isAdmin, payload);
  }

  private async isAdmin(userIdOrName: number | string, shouldThrow = false) {
    try {
      const teams = await this.gitlab.getUserGroups(userIdOrName);
      return teams.find(findTeamByIdOrName(this.adminTeamName)) !== undefined;
    } catch (error) {
      if (shouldThrow) {
        throw error;
      }
      return false;
    }
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

  private async teamIdOrNameToTeamId(teamIdOrName: string | number) {
    let teamId = parseInt(String(teamIdOrName), 10);
    if (isNaN(teamId)) {
      const teams = await this.gitlab.searchGroups(teamIdOrName as string);
      if (!teams.length) {
        throw Error(`No teams found matching ${teamIdOrName}`);
      }
      if (teams.length > 1) {
        throw Error(`Found multiple teams matching ${teamIdOrName}`);
      }
      teamId = teams[0].id;
    }
    return teamId;
  }

  public setAuthCookie(request: Hapi.Request, reply: Hapi.IReply) {
    const headerToken: string | undefined = (request.auth as any).token;
    const cookieToken: string | undefined = request.state && request.state.token;
    if (headerToken && request.auth.credentials && cookieToken !== headerToken) {
      reply.state('token', headerToken);
    }
  }

  public async registerAuth(server: Hapi.Server) {
    await server.register(auth);
    server.auth.strategy('jwt', 'jwt', true, {
      ...this.hapiOptions,
      validateFunc: this.authorizeUser.bind(this),
    });
    server.auth.strategy('customAuthorize', 'jwt', false, {
      ...this.hapiOptions,
      validateFunc: this.authorizeCustom.bind(this),
    });
    server.auth.strategy('admin', 'jwt', false, {
      ...this.hapiOptions,
      validateFunc: this.authorizeAdmin.bind(this),
    });
    const ttl = 365 * 24 * 3600 * 1000; // ~year in ms
    server.state('token', accessTokenCookieSettings(this.authCookieDomain, ttl));
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

export function assertSub(sub: string) {
  if (!validateSub(sub)) {
    throw new Error(`Invalid sub claim ${sub}`);
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

export function sanitizeUsername(username: string) {
  return username.replace('|', '-');
}

export function findTeamByIdOrName(teamNameOrId: string | number) {
  const _teamNameOrId = String(teamNameOrId);
  return (team: Group) => team.name === _teamNameOrId
    || team.path === _teamNameOrId
    || team.id === parseInt(_teamNameOrId, 10);
}

function authorize(gitlab: GitlabClient, userName: string, request: Hapi.Request) {
  try {
    let teamId = NaN;
    // Check if we have a teamId passed in the path
    teamId = parseInt(request.params.teamId, 10);
    if (!isNaN(teamId)) {
      return userHasAccessToTeam(gitlab, userName)(teamId);
    }

    // Check if we can parse projectId from branchId
    let projectId = NaN;
    if (request.params.branchId) {
      const parts = parseApiBranchId(request.params.branchId);
      if (parts && parts.projectId) {
        projectId = parts.projectId;
      }
    }
    if (isNaN(projectId)) {
      // Check if we have a projectId passed in the request
      projectId = parseInt(request.params.projectId, 10);
    }
    if (!isNaN(projectId)) {
      return userHasAccessToProject(gitlab, userName)(projectId);
    }
    return false;
  } catch (error) {
    // TODO: log error
    return false;
  }
}

export function userHasAccessToTeam(gitlab: GitlabClient, userNameOrRequest: Hapi.Request | string) {
  return async (teamId: number, shouldThrowOnFalse = false) => {
    try {
      // the username field is set by the 'validateFuncFactory'
      const userName = typeof userNameOrRequest === 'string' ?
        userNameOrRequest :
        userNameOrRequest.auth.credentials.username;
      return (await gitlab.getGroup(teamId, userName)).id === teamId;
    } catch (error) {
      if (shouldThrowOnFalse) {
        throw error;
      }
      return false;
    }
  };
}

export function userHasAccessToProject(gitlab: GitlabClient, userNameOrRequest: Hapi.Request | string) {
  return async (projectId: number, shouldThrowOnFalse = false) => {
    try {
      // the username field is set by the 'validateFuncFactory'
      const userName = typeof userNameOrRequest === 'string' ?
        userNameOrRequest :
        userNameOrRequest.auth.credentials.username;
      return (await gitlab.getProject(projectId, userName)).id === projectId;
    } catch (error) {
      if (shouldThrowOnFalse) {
        throw error;
      }
      return false;
    }
  };
}

export function accessTokenCookieSettings(
  domainOrBaseUrl: string,
  ttl?: number,
  defaultPath = '/',
): Hapi.ICookieSettings {
  const regex = /^(https?:\/\/)?\.?([^\/:]+)(:\d+)?(\/.+)?$/;
  const urlParts = regex.exec(domainOrBaseUrl);
  if (urlParts === null) {
    throw new Error(`Invalid domain: ${domainOrBaseUrl}`);
  }
  const isSecure = !urlParts[1] || urlParts[1] === 'https://';
  const domain = `.${urlParts[2]}`;
  const path = urlParts[4] || defaultPath;
  return {
    ttl,
    isSecure,
    domain,
    path,
    isHttpOnly: true,
    isSameSite: false,
    encoding: 'none',
    strictHeader: true,
  };
}
