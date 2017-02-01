import * as auth from 'hapi-auth-jwt2';
import { Container } from 'inversify';

import { jwtOptionsInjectSymbol } from '../authentication';
import AuthenticationModule from '../authentication/authentication-module';
import { goodOptionsInjectSymbol } from '../server';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';

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

function ignoreExpiration(production: auth.JWTStrategyOptions) {
  return {
    ...production,
    verifyOptions: {
      ...production.verifyOptions,
      ignoreExpiration: true,
    },
  };
}

export default (kernel: Container) => {
  developmentConfig(kernel);
  kernel.unbind(fetchInjectSymbol);
  kernel.bind(fetchInjectSymbol).toConstantValue(fetchMock.fetchMock);
  kernel.unbind(goodOptionsInjectSymbol);
  kernel.bind(goodOptionsInjectSymbol).toConstantValue({});
  kernel.unbind(GitlabClient.injectSymbol);
  kernel.bind(GitlabClient.injectSymbol).toConstantValue(getClient());
  const jwtTestOptions = ignoreExpiration(kernel.get(jwtOptionsInjectSymbol));
  kernel.unbind(jwtOptionsInjectSymbol);
  kernel.bind(jwtOptionsInjectSymbol).toConstantValue(jwtTestOptions);
};
