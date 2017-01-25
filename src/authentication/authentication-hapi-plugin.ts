
// import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
// import * as Joi from 'joi';
import * as jwksRsa from 'jwks-rsa';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import AuthenticationModule from './authentication-module';
import { authServerBaseUrlInjectSymbol } from './types';

interface UserId {
  id: string;
  idp: string;
}

@injectable()
class AuthenticationHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('authentication-hapi-plugin');
  private authenticationModule: AuthenticationModule;
  private authServerBaseUrl: string;
  private logger: Logger;
  private teamTokenClaim = 'http://team_token';

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(authServerBaseUrlInjectSymbol) authServerBaseUrl: string,
    @inject(loggerInjectSymbol) logger: Logger) {
    super({
      name: 'authentication-plugin',
      version: '1.0.0',
    });
    this.authenticationModule = authenticationModule;
    this.authServerBaseUrl  = authServerBaseUrl;
    this.logger = logger;

  }

  public async register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    await this.registerAuth(server);

    // server.route({
    //   method: 'GET',
    //   path: '/ci/projects/{projectId}/{ref}/{sha}/yml',
    //   handler: {
    //     async: this.getGitlabYmlRequestHandler,
    //   },
    //   config: {
    //     bind: this,
    //     validate: {
    //       params: {
    //         projectId: Joi.number().required(),
    //         ref: Joi.string().required(),
    //         sha: Joi.string(),
    //       },
    //     },
    //   },
    // });
    next();
  }

  public getUserId(sub: string) {
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

  public async signToTeam(_uid: UserId, teamToken: string) {
    return teamToken;
  }

  public async getTeam(uid: UserId) {
    return uid.idp;
  }

  public async validateUser(
    decoded: any,
    _request: any,
    callback: (err: any, valid: boolean, credentials?: any) => void,
  ) {
    this.logger.info('Validating user:', decoded);

    try {
      const uid = this.getUserId(decoded.sub);
      let teamId: string;
      if (decoded[this.teamTokenClaim]) {
        teamId = await this.signToTeam(uid, decoded[this.teamTokenClaim]);
      }
      teamId = await this.getTeam(uid);
      return callback(null, true, { teamId });
    } catch (err) {
      return callback(err, false);
    }

  }

  public async registerAuth(server: Hapi.Server) {
    await server.register(auth);

    const jwtOptions: auth.JWTStrategyOptions = {

      // Get the complete decoded token, because we need info from the header (the kid)
      complete: true,

      // Dynamically provide a signing key based on the kid in the header
      // and the singing keys provided by the JWKS endpoint.
      key: jwksRsa.hapiJwt2Key({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 2,
        jwksUri: `${this.authServerBaseUrl}/.well-known/jwks.json`,
      }),

      // Your own logic to validate the user.
      validateFunc: this.validateUser.bind(this),

      // Validate the audience and the issuer.
      verifyOptions: {
        audience: 'urn:my-resource-server',
        issuer: `${this.authServerBaseUrl}/`,
        algorithms: [ 'RS256' ],
      },
    };

    server.auth.strategy('jwt', 'jwt', 'required', jwtOptions);
  }
}

export default AuthenticationHapiPlugin;
