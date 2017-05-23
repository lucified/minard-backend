import * as cacheManager from 'cache-manager';
import { Container } from 'inversify';
import { sign } from 'jsonwebtoken';
import * as Knex from 'knex';

import * as fetchMock from 'fetch-mock';
import {
  AccessToken,
  authCookieDomainInjectSymbol,
  jwtOptionsInjectSymbol,
  teamTokenClaimKey,
} from '../authentication';
import AuthenticationModule from '../authentication/authentication-module';
import { eventStoreConfigInjectSymbol } from '../event-bus';
import { JsonApiHapiPlugin } from '../json-api';
import { externalBaseUrlInjectSymbol, goodOptionsInjectSymbol } from '../server';
import { cacheInjectSymbol } from '../shared/cache';
import { GitlabClient } from '../shared/gitlab-client';
import Logger, { loggerInjectSymbol } from '../shared/logger';
import { charlesKnexInjectSymbol, fetchInjectSymbol } from '../shared/types';
import productionConfig from './config-production';

const logger = Logger(undefined, true);

const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return 'secret-token';
    }
  }
  return new GitlabClient(
    'gitlab',
    (fetchMock as any).fetchMock,
    new MockAuthModule() as AuthenticationModule,
    logger,
    false,
  );
};

// Access token parameters
const env = process.env;
const PORT = env.PORT ? parseInt(env.PORT, 10) : 8000;
const EXTERNAL_BASEURL = `http://localhost:${PORT}`;
const AUTH_AUDIENCE = EXTERNAL_BASEURL;
const AUTH_COOKIE_DOMAIN = AUTH_AUDIENCE;

export const issuer = 'https://issuer.foo.com';
export const secretKey = 'shhhhhhh';
export const algorithm = 'HS256';

function getJwtOptions(log = false) {
  const verifyOptions = {
    audience: AUTH_AUDIENCE,
    issuer,
    algorithms: [algorithm],
    ignoreExpiration: false,
  };

  return {
    // Get the complete decoded token, because we need info from the header (the kid)
    complete: true,
    key: secretKey,
    verifyOptions,
    // Validate the audience, issuer, algorithm and expiration.
    errorFunc: (context: any) => {
      if (log) {
        console.dir({ ...verifyOptions, secretKey, context }, { colors: true });
      }
      return context;
    },
  };
}

export function getAccessToken(sub: string, teamToken?: string, email?: string): AccessToken {
  let payload = {
    iss: issuer,
    sub,
    aud: [AUTH_AUDIENCE],
    azp: 'azp',
    scope: 'openid profile email',
    exp: Math.round(Date.now() / 1000) + 3600,
    iat: Math.round(Date.now() / 1000) - 3600,
    email: email || 'foo@bar.com',
  };
  if (teamToken) {
    payload = { ...payload, [teamTokenClaimKey]: teamToken };
  }
  return payload;
}

export function getSignedAccessToken(sub: string, teamToken?: string, email?: string) {
  return sign(getAccessToken(sub, teamToken, email), secretKey);
}

export default (kernel: Container) => {
  productionConfig(kernel);
  kernel.rebind(fetchInjectSymbol).toConstantValue(fetchMock);
  kernel.rebind(goodOptionsInjectSymbol).toConstantValue({});
  kernel.rebind(GitlabClient.injectSymbol).toConstantValue(getClient());
  const charlesKnex = Knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  kernel.rebind(charlesKnexInjectSymbol).toConstantValue(charlesKnex);
  kernel.rebind(loggerInjectSymbol).toConstantValue(logger);
  kernel.rebind(jwtOptionsInjectSymbol).toConstantValue(getJwtOptions());
  kernel.rebind(authCookieDomainInjectSymbol).toConstantValue(AUTH_COOKIE_DOMAIN);
  kernel.rebind(externalBaseUrlInjectSymbol).toConstantValue(EXTERNAL_BASEURL);

  const cache = cacheManager.caching({
    store: 'memory',
    max: 10,
    ttl: 0,
  });
  kernel.rebind(cacheInjectSymbol).toConstantValue(cache);
  kernel.rebind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin).inTransientScope();
  kernel.rebind(eventStoreConfigInjectSymbol).toConstantValue({type: 'inmemory'});
};
