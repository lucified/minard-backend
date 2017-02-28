import * as auth from 'hapi-auth-jwt2';
import { Container } from 'inversify';
import { sign } from 'jsonwebtoken';
import * as Knex from 'knex';

import { AccessToken, jwtOptionsInjectSymbol, teamTokenClaimKey } from '../authentication';
import AuthenticationModule from '../authentication/authentication-module';
import { goodOptionsInjectSymbol } from '../server';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import Logger, { loggerInjectSymbol } from '../shared/logger';
import { charlesKnexInjectSymbol, fetchInjectSymbol } from '../shared/types';

import developmentConfig from './config-development';

const logger = Logger(undefined, true);

const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return 'secret-token';
    }
  }
  return new GitlabClient('gitlab', fetchMock.fetchMock, new MockAuthModule() as AuthenticationModule, logger, false);
};

const charlesKnex = Knex({
  client: 'sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

// Access token parameters
export const audience = 'https://api.foo.com';
export const issuer = 'https://issuer.foo.com';
export const secretKey = 'shhhhhhh';
export const algorithm = 'HS256';

function getJwtOptions(): auth.JWTStrategyOptions {
  return {
    // Get the complete decoded token, because we need info from the header (the kid)
    complete: true,
    key: secretKey,
    // Validate the audience, issuer, algorithm and expiration.
    verifyOptions: {
      audience,
      issuer,
      algorithms: [algorithm],
      ignoreExpiration: false,
    },
  };
}

export function getAccessToken(sub: string, teamToken?: string, email?: string) {
  let payload: Partial<AccessToken> = {
    iss: issuer,
    sub,
    aud: [audience],
    azp: 'azp',
    scope: 'openid profile email',
  };
  if (teamToken) {
    payload = { ...payload, [teamTokenClaimKey]: teamToken };
  }
  if (email) {
    payload = { ...payload, email };
  }
  return sign(payload, secretKey);
}

export default (kernel: Container) => {
  developmentConfig(kernel);
  kernel.rebind(fetchInjectSymbol).toConstantValue(fetchMock.fetchMock);
  kernel.rebind(goodOptionsInjectSymbol).toConstantValue({});
  kernel.rebind(GitlabClient.injectSymbol).toConstantValue(getClient());
  kernel.rebind(charlesKnexInjectSymbol).toConstantValue(charlesKnex);
  kernel.rebind(loggerInjectSymbol).toConstantValue(logger);
  kernel.rebind(jwtOptionsInjectSymbol).toConstantValue(getJwtOptions());
};
