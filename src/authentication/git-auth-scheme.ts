import { WebAuth } from 'auth0-js';
import * as Boom from 'boom';
import { decode, verify } from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import fetch from 'node-fetch';
import { promisify } from 'util';

import * as Hapi from '../server/hapi';
import getResponseJson from '../shared/get-response-json';
import { Logger } from '../shared/logger';
import { sanitizeSubClaim } from './authentication-hapi-plugin';
import { AccessToken } from './types';

interface Auth0LoginResponse {
  accessToken: string;
  expisresIn: number;
}

export class GitAuthScheme {
  private readonly _getSigningKey: (arg1: string) => Promise<jwksRsa.Key>;
  private readonly webAuth: WebAuth;
  private readonly userLogin: (options: any) => Promise<Auth0LoginResponse>;

  public constructor(
    auth0ClientId: string,
    private readonly auth0Domain: string,
    private readonly auth0Audience: string,
    private readonly passwordFactory: (username: string) => string,
    private readonly logger?: Logger,
  ) {
    const webAuth = new WebAuth({
      domain: auth0Domain.replace(/^https?:\/\//, ''),
      clientID: auth0ClientId,
      responseType: 'token',
      audience: auth0Audience,
    });
    this.webAuth = webAuth;
    this.userLogin = promisify(webAuth.client.login.bind(webAuth.client));
    const keyClient = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 2,
      jwksUri: `${this.auth0Domain}/.well-known/jwks.json`,
    });
    keyClient.getSigningKey = keyClient.getSigningKey.bind(keyClient);
    this._getSigningKey = promisify(keyClient.getSigningKey);
  }

  public async getSigningKey(decoded: any) {
    if (!decoded || !decoded.header) {
      throw new Error('Invalid JWT');
    }

    // Only RS256 is supported.
    if (decoded.header.alg !== 'RS256') {
      throw new Error('Only RS256 is supported');
    }

    const key = await this._getSigningKey(decoded.header.kid);

    if (!key.publicKey && !key.rsaPublicKey) {
      throw new Error('Invalid signing key');
    }
    return key.publicKey || key.rsaPublicKey!;
  }

  public getScheme() {
    return (_server: Hapi.Server, _options: any) => ({
      authenticate: async (request: Hapi.Request, reply: Hapi.IReply) => {
        try {
          const { username, password } = this.parseBasicAuth(request);
          const { accessToken } = await this.login(username, password);
          const signingKey = await this.getSigningKey(this.decode(accessToken));
          const credentials = this.verify(accessToken, signingKey);
          return reply.continue({ credentials });
        } catch (_error) {
          this.logger &&
            this.logger.debug(`Invalid Git request: ${_error.message}`);
          const error = _error.isBoom
            ? _error
            : Boom.create(_error.statusCode || 401, _error.description);
          return reply(error);
        }
      },
    });
  }

  public login(username: string, password: string) {
    if (username.indexOf('@') >= 0) {
      return this.userLogin({
        realm: 'Username-Password-Authentication',
        username,
        password,
        scope: 'openid email',
      });
    }
    return this.clientLogin(username, password);
  }

  public async clientLogin(clientId: string, clientSecret: string) {
    const body = {
      audience: this.auth0Audience,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    };
    const url = `${this.auth0Domain}/oauth/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await getResponseJson<{ access_token: string }>(response);
    return { accessToken: json.access_token as string };
  }

  public decode(accessToken: string) {
    return decode(accessToken, { complete: true, json: true });
  }

  public verify(accessToken: string, signingKey: string): AccessToken {
    const payload = verify(accessToken, signingKey, {
      audience: this.auth0Audience,
      issuer: `${this.auth0Domain}/`,
      algorithms: ['RS256'],
      ignoreExpiration: false,
    }) as AccessToken;
    const userName = sanitizeSubClaim(payload.sub);
    payload.username = userName;
    payload.gitlabPassword = this.passwordFactory(userName);
    return payload;
  }

  public parseBasicAuth(req: Hapi.Request) {
    const authorization = req.headers.authorization;
    if (!authorization) {
      throw Boom.unauthorized(null, 'Basic');
    }

    const parts = authorization.split(/\s+/);

    if (parts[0].toLowerCase() !== 'basic') {
      throw Boom.unauthorized(null, 'Basic');
    }

    if (parts.length !== 2) {
      throw Boom.badRequest('Bad HTTP authentication header format', 'Basic');
    }

    const credentialsPart = new Buffer(parts[1], 'base64').toString();
    const sep = credentialsPart.indexOf(':');
    if (sep === -1) {
      throw Boom.badRequest('Bad header internal syntax', 'Basic');
    }

    const username = credentialsPart.slice(0, sep);
    const password = credentialsPart.slice(sep + 1);

    if (!username) {
      throw Boom.unauthorized(
        'HTTP authentication header missing username',
        'Basic',
      );
    }
    return { username, password };
  }
}
