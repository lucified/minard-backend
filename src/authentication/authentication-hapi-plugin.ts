import {
  badImplementation,
  badRequest,
  create,
  notFound,
  unauthorized,
  wrap,
} from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable, optional } from 'inversify';
import { hapiJwt2Key } from 'jwks-rsa';
import * as Knex from 'knex';

import { parseApiBranchId } from '../json-api/conversions';
import { hasPublicDeployments } from '../project/util';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { IFetch } from '../shared/fetch';
import { Group } from '../shared/gitlab';
import { GitlabClient, looselyValidateEmail } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import {
  adminIdInjectSymbol,
  charlesKnexInjectSymbol,
  fetchInjectSymbol,
} from '../shared/types';
import { GitAuthScheme } from './git-auth-scheme';
import {
  generateAndSaveTeamToken,
  getTeamIdWithToken,
  teamTokenQuery,
} from './team-token';
import {
  AccessToken,
  auth0AudienceInjectSymbol,
  auth0ClientIdInjectSymbol,
  auth0DomainInjectSymbol,
  authCookieDomainInjectSymbol,
  AuthorizationStatus,
  Authorizer,
  internalHostSuffixesInjectSymbol,
  jwtOptionsInjectSymbol,
  RequestCredentials,
  STRATEGY_GIT,
  STRATEGY_INTERNAL_REQUEST,
  STRATEGY_ROUTELEVEL_ADMIN_HEADER,
  STRATEGY_ROUTELEVEL_USER_COOKIE,
  STRATEGY_ROUTELEVEL_USER_HEADER,
  STRATEGY_TOPLEVEL_USER_HEADER,
  STRATEGY_TOPLEVEL_USER_URL,
  teamTokenClaimKey,
} from './types';

const teamIdOrNameKey = 'teamIdOrName';

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {
  private readonly gitAuthScheme: GitAuthScheme;
  public static injectSymbol = Symbol('authentication-hapi-plugin');

  constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(authCookieDomainInjectSymbol)
    private readonly authCookieDomain: string,
    @inject(auth0ClientIdInjectSymbol) auth0ClientId: string,
    @inject(auth0DomainInjectSymbol) private readonly auth0Domain: string,
    @inject(auth0AudienceInjectSymbol) private readonly auth0Audience: string,
    @inject(charlesKnexInjectSymbol) private readonly db: Knex,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(adminIdInjectSymbol) private readonly adminId: string,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
    @inject(internalHostSuffixesInjectSymbol)
    private readonly internalHostSuffixes: string[],
    @inject(jwtOptionsInjectSymbol)
    @optional()
    private readonly defaultJWTOptions?: auth.JWTStrategyOptions,
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
    this.gitAuthScheme = new GitAuthScheme(
      auth0ClientId,
      auth0Domain,
      auth0Audience,
      this.gitlab.getUserPassword.bind(this.gitlab),
      logger,
    );
    this.authorizeAdmin = this.authorizeAdmin.bind(this);
    this.authorizeUser = this.authorizeUser.bind(this);
    this.authorizeCustom = this.authorizeCustom.bind(this);
  }

  public async register(
    server: Hapi.Server,
    _options: Hapi.ServerOptions,
    next: () => void,
  ) {
    await this.registerAuth(server);
    server.route([
      {
        method: 'GET',
        path: '/team',
        handler: {
          async: this.getTeamHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          cors: {
            credentials: true,
          },
        },
      },
    ]);
    server.route([
      {
        method: 'GET',
        path: '/signup',
        handler: {
          async: this.signupHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          cors: {
            credentials: true,
          },
        },
      },
    ]);
    server.route({
      method: 'GET',
      path: '/team-token/{teamIdOrName?}',
      handler: {
        async: this.getTeamTokenHandler,
      },
      config: {
        bind: this,
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
      },
    });
    server.route({
      method: 'GET',
      path: '/logout',
      handler: {
        async: this.logoutHandler,
      },
      config: {
        bind: this,
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
        cors: {
          credentials: true,
        },
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
        auth: STRATEGY_ROUTELEVEL_ADMIN_HEADER,
      },
    });

    this.decorateRequest(server);
    next();
  }

  // For use in unit tests
  public async registerNoOp(
    server: Hapi.Server,
    _opt: Hapi.ServerOptions,
    next: () => void,
  ) {
    const testUsername = 'auth-123';
    server.auth.scheme('noOp', (_server: Hapi.Server, _options: any) => {
      return {
        authenticate: (
          _request: Hapi.Request,
          reply: Hapi.ReplyWithContinue,
        ) => {
          return reply.continue({ credentials: { username: testUsername } });
        },
      };
    });
    server.auth.strategy(STRATEGY_INTERNAL_REQUEST, 'noOp', false);
    server.auth.strategy(STRATEGY_TOPLEVEL_USER_HEADER, 'noOp', false);
    server.auth.strategy(STRATEGY_TOPLEVEL_USER_URL, 'noOp', false);
    server.auth.strategy(STRATEGY_ROUTELEVEL_USER_HEADER, 'noOp', false);
    server.auth.strategy(STRATEGY_ROUTELEVEL_USER_COOKIE, 'noOp', false);
    server.auth.strategy(STRATEGY_ROUTELEVEL_ADMIN_HEADER, 'noOp', false);
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
    server.decorate(
      'request',
      'userHasAccessToDeployment',
      this.userHasAccessToDeployment.bind(this),
      { apply: false },
    );
    server.decorate(
      'request',
      'isInternal',
      this.isInternalRequest.bind(this),
      { apply: true },
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
      'userHasAccessToDeployment',
      this.userHasAccessToDeployment.bind(this),
      { apply: false },
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
    server.decorate(
      'request',
      'isInternal',
      this.isInternalRequest.bind(this),
      { apply: true },
    );
  }

  public async getTeamHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const username = sanitizeSubClaim(credentials.sub);
      const teams = await this._getUserGroups(username);
      if (teams.length > 1) {
        throw badImplementation('User can only belong to a single team.');
      }
      const team = teams[0];
      if (!team) {
        throw notFound();
      }
      this.setAuthCookie(request, reply);
      const teamTokenResult = await teamTokenQuery(this.db, {
        teamId: team.id,
      });
      const teamToken = teamTokenResult && teamTokenResult.length
        ? teamTokenResult[0].token
        : undefined;
      return reply({
        id: team.id,
        name: team.name,
        description: team.description,
        avatar_url: team.avatar_url,
        'invitation-token': teamToken,
      });
    } catch (error) {
      this.logger.error(`Can't fetch user or team`, error);
      return reply(error.isBoom ? error : wrap(error, 404));
    }
  }

  public async logoutHandler(
    _request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    return reply(200).unstate('token');
  }

  /**
   * Allows fetching a team-token for a team that:
   *  1. An authenticated user belongs to
   *  2. An admin user has specified in the request by a team's id or name
   */
  public async getTeamTokenHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const credentials = request.auth.credentials as AccessToken;
      const userName = sanitizeSubClaim(credentials.sub);
      const isAdmin = await this.isAdmin(userName);
      const userTeams = await this._getUserGroups(userName);
      const teamIdOrName = request.params[teamIdOrNameKey];

      let requestedOwnTeam: Group | undefined;
      if (userTeams.length && teamIdOrName) {
        requestedOwnTeam = userTeams.find(findTeamByIdOrName(teamIdOrName));
      }

      let teamId: number | undefined;

      if (requestedOwnTeam) {
        // a request for a team that the user belongs to
        teamId = requestedOwnTeam.id;
      } else if (isAdmin && teamIdOrName) {
        // An admin can get any team's token
        teamId = await this.teamIdOrNameToTeamId(teamIdOrName);
      } else if (!teamIdOrName) {
        // no specific team requested, try to return one anyway
        if (!userTeams.length) {
          throw Error(`User ${userName} is not in any team`);
        }
        if (userTeams.length > 1) {
          throw Error(`User ${userName} is in multiple teams`);
        }
        // NOTE: we only support a single team for now
        teamId = userTeams[0].id;
      } else {
        return reply(create(401, `Insufficient privileges`));
      }
      const teamToken = await teamTokenQuery(this.db, { teamId });
      if (!teamToken || !teamToken.length) {
        throw new Error(`No token found for team ${teamId}`);
      }
      return reply(teamToken[0]);
    } catch (error) {
      return reply(notFound(error.message));
    }
  }

  public async createTeamTokenHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const teamIdOrName = request.params[teamIdOrNameKey];
      const teamId = await this.teamIdOrNameToTeamId(teamIdOrName);
      const teamToken = await generateAndSaveTeamToken(teamId, this.db);
      this.logger.debug('Created a new team-token for team %s', teamIdOrName);
      return reply(teamToken).code(201);
    } catch (error) {
      return reply(badRequest(error.message));
    }
  }

  public async signupHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    let email: string | undefined;
    let credentials: AccessToken | undefined;
    try {
      credentials = request.auth.credentials as AccessToken;
      email = credentials.email;
      if (!looselyValidateEmail(email)) {
        // Fall back to fetching the email from Auth0
        email = await this.tryGetEmailFromAuth0((request.auth as any).token);
      }
      if (!looselyValidateEmail(email)) {
        throw new Error(`Invalid email ${email}`);
      }
      const teamToken = credentials[teamTokenClaimKey];
      if (!teamToken) {
        throw new Error('Missing team token');
      }
      const teamId = await getTeamIdWithToken(teamToken, this.db);
      const team = await this._getGroup(teamId);
      const { id, idp } = parseSub(credentials.sub);
      const username = sanitizeSubClaim(credentials.sub);
      const password = this.gitlab.getUserPassword(username);
      const user = await this._createUser(
        email,
        password,
        username,
        email,
        id,
        idp,
      );
      await this._addUserToGroup(user.id, teamId);
      this.setAuthCookie(request, reply);
      return reply({
        team,
      }).code(201); // created
    } catch (error) {
      const message = `Unable to sign up user ${email}: ${(error.isBoom &&
        (error.output.payload.message || error.data.message)) ||
        error.message}`;
      this.logger.error(message, credentials);
      return reply(badRequest(message));
    }
  }

  private async authorizeUser(userName: string, request: Hapi.Request) {
    const isAuthorized =
      (await this.isAdmin(userName)) ||
      (await this.authorize(userName, request));
    return isAuthorized
      ? AuthorizationStatus.AUTHORIZED
      : AuthorizationStatus.UNAUTHORIZED;
  }

  private async authorizeAdmin(userName: string, _request: Hapi.Request) {
    const isAuthorized = await this.isAdmin(userName);
    return isAuthorized
      ? AuthorizationStatus.AUTHORIZED
      : AuthorizationStatus.UNAUTHORIZED;
  }

  private authorizeCustom(_userName: string, _request: Hapi.Request) {
    return Promise.resolve(AuthorizationStatus.NOT_CHECKED);
  }

  private validateFuncFactory(authorizer: Authorizer) {
    return async (
      payload: AccessToken,
      request: Hapi.Request,
      callback: (err: any, valid: boolean, credentials?: any) => void,
    ) => {
      let authorizationStatus: AuthorizationStatus =
        AuthorizationStatus.UNAUTHORIZED;
      try {
        const userName = sanitizeSubClaim(payload.sub);
        payload.username = userName;
        authorizationStatus = await authorizer(userName, request);
      } catch (error) {
        // TODO: logging, this can happen very often
        this.logger.warn('Authorization exception: %s', error.message);
      }
      if (authorizationStatus === AuthorizationStatus.UNAUTHORIZED) {
        this.logger.debug(
          'User %s not is not authorized',
          payload.username || payload.sub,
        );
      }
      return callback(
        undefined,
        authorizationStatus === AuthorizationStatus.AUTHORIZED ||
          authorizationStatus === AuthorizationStatus.NOT_CHECKED,
        {
          ...payload,
          authorizationStatus,
        },
      );
    };
  }

  private getUserName(request: Hapi.Request): string {
    // the username field is set above by the 'validateFuncFactory'
    return request.auth.credentials.username as string;
  }

  private async tryGetEmailFromAuth0(accessToken: string) {
    // We assume that if the issuer is defined, it's the Auth0 baseUrl
    let email: string | undefined;
    const userInfo = await getAuth0UserInfo(
      this.auth0Domain,
      accessToken,
      this.fetch,
    );
    if (looselyValidateEmail(userInfo.email)) {
      email = userInfo.email;
      // the email can actually be in the name field depending on the identity provider
    } else if (looselyValidateEmail(userInfo.name)) {
      email = userInfo.name;
    }
    return email;
  }

  private async teamIdOrNameToTeamId(teamIdOrName: string | number) {
    let teamId = parseInt(String(teamIdOrName), 10);
    if (isNaN(teamId)) {
      const teams = await this._searchGroups(String(teamIdOrName));
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

  private setAuthCookie(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    const headerToken: string | undefined = (request.auth as any).token;
    const cookieToken: string | undefined =
      request.state && request.state.token;
    if (
      headerToken &&
      request.auth.isAuthenticated &&
      cookieToken !== headerToken
    ) {
      reply.state('token', headerToken);
    }
  }

  protected async registerAuth(server: Hapi.Server) {
    await server.register(auth);
    const defaultJWTOptions =
      this.defaultJWTOptions || this.getDefaultJWTOptions();
    server.auth.strategy(STRATEGY_TOPLEVEL_USER_HEADER, 'jwt', true, {
      ...defaultJWTOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeUser),
    });
    server.auth.strategy(STRATEGY_TOPLEVEL_USER_URL, 'jwt', false, {
      ...defaultJWTOptions,
      headerKey: false,
      cookieKey: false,
      urlKey: 'token',
      validateFunc: this.validateFuncFactory(this.authorizeUser),
    });
    server.auth.strategy(STRATEGY_ROUTELEVEL_ADMIN_HEADER, 'jwt', false, {
      ...defaultJWTOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeAdmin),
    });
    server.auth.strategy(STRATEGY_ROUTELEVEL_USER_HEADER, 'jwt', false, {
      ...defaultJWTOptions,
      headerKey: 'authorization',
      cookieKey: false,
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeCustom),
    });
    server.auth.strategy(STRATEGY_ROUTELEVEL_USER_COOKIE, 'jwt', false, {
      ...defaultJWTOptions,
      headerKey: false,
      cookieKey: 'token',
      urlKey: false,
      validateFunc: this.validateFuncFactory(this.authorizeCustom),
    });
    server.auth.scheme('internal', (_server: Hapi.Server, _options: any) => ({
      authenticate: (request: Hapi.Request, reply: Hapi.ReplyWithContinue) => {
        if (this.isInternalRequest(request)) {
          return reply.continue({ credentials: {} });
        } else {
          return reply(unauthorized());
        }
      },
    }));
    server.auth.strategy(STRATEGY_INTERNAL_REQUEST, 'internal', false);
    server.auth.scheme('git', this.gitAuthScheme.getScheme());
    server.auth.strategy(STRATEGY_GIT, 'git', false);
    const ttl = 365 * 24 * 3600 * 1000; // ~year in ms
    server.state(
      'token',
      accessTokenCookieSettings(this.authCookieDomain, ttl),
    );
  }

  private isInternalRequest(request: Hapi.Request) {
    const { internalHostSuffixes } = this;
    const host = request.headers.host;
    if (!host) {
      return false;
    }
    const split = host.split(':');
    const hostWithoutPort = split[0];
    const ret =
      internalHostSuffixes.filter(suffix => hostWithoutPort.endsWith(suffix))
        .length > 0;
    return ret;
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
        this.logger.warn(
          `Can't check authorization since user is not authenticated`,
          error,
        );
        return false;
      }
    };
  }

  private userHasAccessToProjectDecorator(request: Hapi.Request) {
    return async (projectId: number) => {
      try {
        return this.userHasAccessToProject(
          this.getUserName(request),
          projectId,
        );
      } catch (error) {
        this.logger.warn(
          `Can't check authorization since user is not authenticated`,
          error,
        );
        return false;
      }
    };
  }

  public async userHasAccessToProject(userName: string, projectId: number) {
    try {
      return await this._userHasAccessToProject(userName, projectId);
    } catch (exception) {
      // Nothing
    }
    return false;
  }

  public async userHasAccessToTeam(userName: string, teamId: number) {
    try {
      return await this._userHasAccessToTeam(userName, teamId);
    } catch (error) {
      // Nothing
    }
    return false;
  }

  public async userHasAccessToDeployment(
    projectId: number,
    deploymentId: number,
    credentials?: RequestCredentials,
  ) {
    try {
      // If it's AUTHORIZED, it was checked on the top level
      // If it's NOT_CHECKED, we need to check here
      // Otherwise only allow access to open deployments
      if (
        (credentials &&
          credentials.authorizationStatus === AuthorizationStatus.AUTHORIZED) ||
        (credentials &&
          credentials.authorizationStatus === AuthorizationStatus.NOT_CHECKED &&
          (await this.userHasAccessToProject(
            credentials.username!,
            projectId,
          ))) ||
        (await this.isOpenDeployment(projectId, deploymentId))
      ) {
        return true;
      }
    } catch (err) {
      // Nothing to be done
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
    const project = await this._getProject(projectId);
    if (project) {
      return hasPublicDeployments(project);
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
      name: project.namespace.name,
    };
  }

  // Public only for unit testing
  public async _userHasAccessToProject(userName: string, projectId: number) {
    if (await this.isAdmin(userName)) {
      return true;
    }
    await this._getProject(projectId, userName); // Throws if no access
    return true;
  }

  // Public only for unit testing
  public async _userHasAccessToTeam(userName: string, teamId: number) {
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
    return Promise.resolve(userName === `clients-${this.adminId}`);
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
    return this.gitlab.createUser(
      email,
      password,
      username,
      name,
      externUid,
      provider,
      confirm,
    );
  }

  private getDefaultJWTOptions(): auth.JWTStrategyOptions {
    return {
      // Get the complete decoded token, because we need info from the header (the kid)
      complete: true,

      // Dynamically provide a signing key based on the kid in the header
      // and the singing keys provided by the JWKS endpoint.
      key: hapiJwt2Key({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 2,
        jwksUri: `${this.auth0Domain}/.well-known/jwks.json`,
      }),

      // Validate the audience, issuer, algorithm and expiration.
      verifyOptions: {
        audience: this.auth0Audience,
        issuer: `${this.auth0Domain}/`,
        algorithms: ['RS256'],
        ignoreExpiration: false,
      },
    };
  }
}

export default AuthenticationHapiPlugin;

export function parseSub(sub: string) {
  if (!validateSubClaim(sub)) {
    throw new Error("Invalid 'sub' claim.");
  }
  const parts = sub.split('|');
  return {
    id: parts[1],
    idp: parts[0],
  };
}

export function validateSubClaim(sub: string) {
  try {
    sanitizeSubClaim(sub);
    return true;
  } catch (error) {
    return false;
  }
}

export function sanitizeSubClaim(sub: string) {
  if (typeof sub !== 'string') {
    throw new Error('Username is not a string');
  }
  // Interactive, i.e. normal, Auth0 accounts are of the form 'auth0|xxxyyyzzz'
  // Non-interactive, e.g. ones used by the integration test, are of the form 'xxxyyyzzz@clients'
  const parts = sub.split(/[|@]/);
  if (parts.length === 2) {
    if (parts[0] === 'auth0') {
      return `auth0-${parts[1]}`;
    }
    if (parts[1] === 'clients') {
      return `clients-${parts[0]}`;
    }
  }
  throw new Error(`Unrecognized username format: ${sub}`);
}

export function assertValidSubClaim(sub: string) {
  if (!validateSubClaim(sub)) {
    throw new Error(`Invalid sub claim ${sub}`);
  }
  return true;
}

export async function getAuth0UserInfo(
  auth0Domain: string,
  accessToken: string,
  fetch: IFetch,
) {
  const baseUrl = auth0Domain.replace(/\/$/, '');
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  };
  const response = await fetch(`${baseUrl}/userinfo`, options);
  return await response.json();
}
function findTeamByName(teamName: string) {
  return (team: Group) => team.name.toLowerCase() === teamName.toLowerCase();
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
): Hapi.ServerStateCookieConfiguationObject {
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
