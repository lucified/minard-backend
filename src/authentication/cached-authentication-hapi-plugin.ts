import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { IFetch } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { adminTeamNameInjectSymbol, charlesKnexInjectSymbol, fetchInjectSymbol } from '../shared/types';
import { authCookieDomainInjectSymbol, jwtOptionsInjectSymbol } from './types';

import memoizee = require('memoizee');
import AuthenticationHapiPlugin from './authentication-hapi-plugin';

@injectable()
class CachedAuthenticationHapiPlugin extends AuthenticationHapiPlugin {

  constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(jwtOptionsInjectSymbol) hapiOptions: auth.JWTStrategyOptions,
    @inject(authCookieDomainInjectSymbol) authCookieDomain: string,
    @inject(charlesKnexInjectSymbol) db: Knex,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(adminTeamNameInjectSymbol) adminTeamName: string,
    @inject(fetchInjectSymbol) fetch: IFetch,
  ) {
    super(
      gitlab,
      hapiOptions,
      authCookieDomain,
      db,
      logger,
      adminTeamName,
      fetch,
    );
    this.userHasAccessToProject = memoizee(
      this.userHasAccessToProject,
      { promise: true, primitive: true },
    );
    this.userHasAccessToTeam = memoizee(
      this.userHasAccessToTeam,
      { promise: true, primitive: true },
    );
  }
}

export default CachedAuthenticationHapiPlugin;
