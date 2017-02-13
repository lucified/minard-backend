import { Container } from 'inversify';
import * as Knex from 'knex';

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

export default (kernel: Container) => {
  developmentConfig(kernel);
  kernel.rebind(fetchInjectSymbol).toConstantValue(fetchMock.fetchMock);
  kernel.rebind(goodOptionsInjectSymbol).toConstantValue({});
  kernel.rebind(GitlabClient.injectSymbol).toConstantValue(getClient());
  kernel.rebind(charlesKnexInjectSymbol).toConstantValue(charlesKnex);
  kernel.rebind(loggerInjectSymbol).toConstantValue(logger);
};
