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
import {
  adminTeamNameInjectSymbol,
  charlesKnexInjectSymbol,
  fetchInjectSymbol,
  openTeamNameInjectSymbol,
} from '../shared/types';
import { generateAndSaveTeamToken, getTeamIdWithToken, teamTokenQuery } from './team-token';
import { AccessToken, authCookieDomainInjectSymbol, jwtOptionsInjectSymbol, teamTokenClaimKey } from './types';

const randomstring = require('randomstring');
const teamIdOrNameKey = 'teamIdOrName';

type Authorizer = (userName: string, request: Hapi.Request) => Promise<boolean | undefined>;

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
    @inject(openTeamNameInjectSymbol) private readonly openTeamName: string,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
  ) {
    super({
      name: 'authentication-plugin',
      version: '1.0.0',
    });
    this.registerNoOp = Object.assign(this.registerNoOp.bind(this), {
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

    this.decorateRequest(server);
    next();
  }

  // For use in unit tests
  public async registerNoOp(server: Hapi.Server, _opt: Hapi.IServerOptions, next: () => void) {
    const testUsername = 'auth-123';
    server.auth.scheme('noOp', (_server: Hapi.Server, _options: any) => {
      return {
        authenticate: (_request: Hapi.Request, reply: Hapi.IReply) => {
          return reply.continue({ credentials: { username: testUsername } });
        },
      };
    });
    server.auth.strategy('customAuthorize', 'noOp', false);
    server.auth.strategy('admin', 'noOp', false);
    server.decorate(
      'request',
      'userHasAccessToProject',
      (_: any) => (_projectId: number) => Promise.resolve(true),
      { apply: true },
    );
    server.decorate(
      'request',
      'userHasAccessToTeam',
      (_: any) => (_teamId: number) => Promise.resolve(true),
      { apply: true },
    );
    server.decorate(
      'request',
      'isOpenDeployment',
      this.isOpenDeployment.bind(this),
      { apply: false },
    );
    server.decorate(
      'request',
      'getProjectTeam',
      this.getProjectTeam.bind(this),
      { apply: false },
    );
    next();
  }

  private decorateRequest(server: Hapi.Server) {
    server.decorate(
      'request',
      'userHasAccessToProject',
      this.userHasAccessToProjectDecorator.bind(this),
      { apply: true },
    );
    server.decorate(
      'request',
      'userHasAccessToTeam',
      this.userHasAccessToTeamDecorator.bind(this),
      { apply: true },
    );
    server.decorate(
      'request',
      'isOpenDeployment',
      this.isOpenDeployment.bind(this),
      { apply: false },
    );
    server.decorate(
      'request',
      'getProjectTeam',
      this.getProjectTeam.bind(this),
      { apply: false },
    );
  }

  public async getTeamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const teams = await this._getUserGroups(sanitizeUsername(credentials.sub));
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
      const userTeams = await this._getUserGroups(userName);
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
      this.logger.debug('Created a new team-token for team %s', teamIdOrName);
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
      const team = await this._getGroup(teamId);
      const password = generatePassword();
      const { id, idp } = parseSub(credentials.sub);
      const user = await this._createUser(
        email,
        password,
        sanitizeUsername(credentials.sub),
        email,
        id,
        idp,
      );
      await this._addUserToGroup(user.id, teamId);
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

  private async authorizeUser(userName: string, request: Hapi.Request) {
    return await this.isAdmin(userName) || await this.authorize(userName, request);
  }

  private async authorizeAdmin(userName: string, _request: Hapi.Request) {
    return this.isAdmin(userName);
  }

  private authorizeCustom(_userName: string, _request: Hapi.Request) {
    return Promise.resolve(undefined);
  }

  private validateFuncFactory(authorizer: Authorizer) {
    return async (
      payload: AccessToken,
      request: Hapi.Request,
      callback: (err: any, valid: boolean, credentials?: any) => void,
    ) => {
      let isAuthorized: boolean | undefined = false;
      try {
        if (assertValidSubClaim(payload.sub)) {
          const userName = sanitizeUsername(payload.sub);
          payload.username = userName;
          isAuthorized = await authorizer(userName, request);
        }
      } catch (error) {
        // TODO: logging, this can happen very often
        this.logger.warn('Authorization exception: %s', error.message);
      }
      if (isAuthorized === false) {
        this.logger.debug('User %s not is not authorized', payload.username || payload.sub);
      }
      // isAuthorized === undefined means the user was authenticated
      // but the authorization hasn't been checked
      return callback(
        undefined,
        isAuthorized === true || isAuthorized === undefined,
        {
          ...payload,
          isAuthorized,
        },
      );
    };
  }

  private getUserName(request: Hapi.Request) {
    // the username field is set above by the 'validateFuncFactory'
    return request.auth.credentials.username as string;
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
      const teams = await this._searchGroups(teamIdOrName as string);
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

  private setAuthCookie(request: Hapi.Request, reply: Hapi.IReply) {
    const headerToken: string | undefined = (request.auth as any).token;
    const cookieToken: string | undefined = request.state && request.state.token;
    if (headerToken && request.auth.credentials && cookieToken !== headerToken) {
      reply.state('token', headerToken);
    }
  }

  protected async registerAuth(server: Hapi.Server) {
    await server.register(auth);
    server.auth.strategy('jwt', 'jwt', true, {
      ...this.hapiOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeUser.bind(this)),
    });
    server.auth.strategy('jwt-url', 'jwt', false, {
      ...this.hapiOptions,
      headerKey: false,
      cookieKey: false,
      urlKey: 'token',
      validateFunc: this.validateFuncFactory(this.authorizeUser.bind(this)),
    });
    server.auth.strategy('admin', 'jwt', false, {
      ...this.hapiOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeAdmin.bind(this)),
    });
    server.auth.strategy('customAuthorize', 'jwt', false, {
      ...this.hapiOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeCustom.bind(this)),
    });
    server.auth.strategy('customAuthorize-cookie', 'jwt', false, {
      ...this.hapiOptions,
      headerKey: false,
      cookieKey: 'token',
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeCustom.bind(this)),
    });
    const ttl = 365 * 24 * 3600 * 1000; // ~year in ms
    server.state('token', accessTokenCookieSettings(this.authCookieDomain, ttl));
  }

  protected authorize(userName: string, request: Hapi.Request) {
    try {
      let teamId = NaN;
      // Check if we have a teamId passed in the path
      teamId = parseInt(request.params.teamId, 10);
      if (!isNaN(teamId)) {
        return this.userHasAccessToTeam(userName, teamId);
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
        return this.userHasAccessToProject(userName, projectId);
      }
      return false;
    } catch (error) {
      // TODO: log error
      return false;
    }
  }

  private userHasAccessToTeamDecorator(request: Hapi.Request) {
    return async (teamId: number) => {
      try {
        return this.userHasAccessToTeam(this.getUserName(request), teamId);
      } catch (error) {
        this.logger.warn(`Can't check authorization since user is not authenticated`, error);
        return false;
      }
    };
  }

  private userHasAccessToProjectDecorator(request: Hapi.Request) {
    return async (projectId: number) => {
      try {
        return this.userHasAccessToProject(this.getUserName(request), projectId);
      } catch (error) {
        this.logger.warn(`Can't check authorization since user is not authenticated`, error);
        return false;
      }
    };
  }

  public async userHasAccessToProject(
    userName: string,
    projectId: number,
  ) {
    try {
      return await this._userHasAccessToProject(userName, projectId);
    } catch (exception) {
      // Nothing
    }
    return false;
  }

  public async userHasAccessToTeam(
    userName: string,
    teamId: number,
  ) {
    try {
      return await this._userHasAccessToTeam(userName, teamId);
    } catch (error) {
      // Nothing
    }
    return false;
  }

  public async isAdmin(userName: string) {
    try {
      return await this._isAdmin(userName);
    } catch (error) {
      // Nothing
    }
    return false;
  }


  public async isOpenDeployment(projectId: number, _deploymentId: number) {
    return this.isOpenProject(projectId);
  }

  public async isOpenProject(projectId: number) {
    const team = await this.getProjectTeam(projectId);
    if (team && this.openTeamName && team.name === this.openTeamName) {
      return true;
    }
    return false;
  }

  public async getProjectTeam(projectId: number) {
    return await this._getProjectTeam(projectId);
  }

  // Public only for unit testing
  public async _getProjectTeam(projectId: number) {
    const project = await this._getProject(projectId);
    return {
      id: project.namespace.id,
      name: project.namespace.path,
    };
  }

  // Public only for unit testing
  public async _userHasAccessToProject(
    userName: string,
    projectId: number,
  ) {
    if (await this.isAdmin(userName)) {
      return true;
    }
    await this._getProject(projectId, userName); // Throws if no access
    return true;
  }

  // Public only for unit testing
  public async _userHasAccessToTeam(
    userName: string,
    teamId: number,
  ) {
    if (await this.isAdmin(userName)) {
      return true;
    }
    const teams = await this._getUserGroups(userName);
    if (teams && teams.find(findTeamById(teamId)) !== undefined) {
      return true;
    }
    return false;
  }

  // Public only for unit testing
  public async _isAdmin(userName: string) {
    const teams = await this._getUserGroups(userName);
    if (teams && teams.find(findTeamByName(this.adminTeamName)) !== undefined) {
      return true;
    }
    return false;
  }

  // Public only for unit testing
  public _getUserGroups(userName: string) {
    return this.gitlab.getUserGroups(userName);
  }

  // Public only for unit testing
  public _getGroup(teamId: number) {
    return this.gitlab.getGroup(teamId);
  }

  // Public only for unit testing
  public async _searchGroups(search: string) {
    return this.gitlab.searchGroups(search);
  }
  // Public only for unit testing
  public _getProject(projectId: number, userName?: string) {
    return this.gitlab.getProject(projectId, userName);
  }
  // Public only for unit testing
  public _addUserToGroup(userId: number, teamId: number) {
    return this.gitlab.addUserToGroup(userId, teamId);
  }

  // Public only for unit testing
  public _createUser(
    email: string,
    password: string,
    username: string,
    name: string,
    externUid?: string,
    provider?: string,
    confirm = false,
  ) {
    return this.gitlab.createUser(email, password, username, name, externUid, provider, confirm);
  }
}

export default AuthenticationHapiPlugin;

export function parseSub(sub: string) {
  if (!validateSubClaim(sub)) {
    throw new Error('Invalid \'sub\' claim.');
  }
  const parts = sub.split('|');
  return {
    id: parts[1],
    idp: parts[0],
  };
}

export function validateSubClaim(sub: string) {
  if (typeof sub !== 'string') {
    return false;
  }
  const parts = sub.split('|');
  if (parts.length !== 2) {
    return false;
  }
  return true;
}

export function assertValidSubClaim(sub: string) {
  if (!validateSubClaim(sub)) {
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

function findTeamByName(teamName: string) {
  return (team: Group) => team.name === teamName;
}
function findTeamById(teamId: number) {
  return (team: Group) => team.id === teamId;
}
function findTeamByIdOrName(key: string | number) {
  let asNumber: number | undefined;
  if (typeof key === 'string') {
    asNumber = parseInt(key, 10);
  }
  if (typeof key === 'number') {
    asNumber = key;
  }
  if (asNumber && !isNaN(asNumber)) {
    return findTeamById(asNumber);
  }
  return findTeamByName(String(key));
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
