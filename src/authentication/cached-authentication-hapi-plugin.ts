import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable, optional } from 'inversify';
import * as Knex from 'knex';
import memoizee = require('memoizee');

import { IFetch } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import {
  adminTeamNameInjectSymbol,
  charlesKnexInjectSymbol,
  fetchInjectSymbol,
  openTeamNamesInjectSymbol,
} from '../shared/types';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import {
  auth0AudienceInjectSymbol,
  auth0ClientIdInjectSymbol,
  auth0DomainInjectSymbol,
  authCookieDomainInjectSymbol,
  internalHostSuffixesInjectSymbol,
  jwtOptionsInjectSymbol,
} from './types';

@injectable()
class CachedAuthenticationHapiPlugin extends AuthenticationHapiPlugin {

  constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(authCookieDomainInjectSymbol) authCookieDomain: string,
    @inject(auth0ClientIdInjectSymbol) auth0ClientId: string,
    @inject(auth0DomainInjectSymbol) auth0Domain: string,
    @inject(auth0AudienceInjectSymbol) auth0Audience: string,
    @inject(charlesKnexInjectSymbol) db: Knex,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(adminTeamNameInjectSymbol) adminTeamName: string,
    @inject(openTeamNamesInjectSymbol) openTeamNames: string[],
    @inject(fetchInjectSymbol) fetch: IFetch,
    @inject(internalHostSuffixesInjectSymbol) internalHostSuffixes: string[],
    @inject(jwtOptionsInjectSymbol) @optional() defaultJWTOptions?: auth.JWTStrategyOptions,
  ) {
    super(
      gitlab,
      authCookieDomain,
      auth0ClientId,
      auth0Domain,
      auth0Audience,
      db,
      logger,
      adminTeamName,
      openTeamNames,
      fetch,
      internalHostSuffixes,
      defaultJWTOptions,
    );
    this.userHasAccessToProjectAsync = memoizee(
      this.userHasAccessToProjectAsync,
      { primitive: true, promise: false, async: true },
    );
    this.userHasAccessToTeamAsync = memoizee(
      this.userHasAccessToTeamAsync,
      { primitive: true, promise: false, async: true },
    );
    this.isAdminAsync = memoizee(
      this.isAdminAsync,
      { primitive: true, promise: false, async: true },
    );
    this.getProjectTeamAsync = memoizee(
      this.getProjectTeamAsync,
      { primitive: true, promise: false, async: true },
    );
  }

  public userHasAccessToTeam(userName: string, teamId: number) {
    return new Promise((resolve, _reject) => {
      this.userHasAccessToTeamAsync(userName, teamId, (error: any, result: boolean) => {
        if (error) {
          return resolve(false);
        }
        return resolve(result);
      });
    });
  }
  protected userHasAccessToTeamAsync(
    userName: string,
    teamId: number,
    done: (err: any, result: boolean) => void,
  ) {
    return this._userHasAccessToTeam(userName, teamId)
      .then(
      result => {
        if (result) {
          return done(undefined, result);
        }
        return done(Boom.notFound(), false); // Don't cache falses
      },
      error => done(error, false),
    );
  }

  public userHasAccessToProject(userName: string, projectId: number) {
    return new Promise((resolve, _reject) => {
      this.userHasAccessToProjectAsync(userName, projectId, (error: any, result: boolean) => {
        if (error) {
          return resolve(false);
        }
        return resolve(result);
      });
    });
  }

  protected userHasAccessToProjectAsync(
    userName: string,
    projectId: number,
    done: (err: any, result: boolean) => void,
  ) {
    return this._userHasAccessToProject(userName, projectId)
      .then(
      result => {
        if (result) {
          return done(undefined, result);
        }
        return done(Boom.notFound(), false); // Don't cache falses
      },
      error => done(error, false),
    );
  }

  public isAdmin(userIdOrName: string) {
    return new Promise((resolve, _reject) => {
      this.isAdminAsync(userIdOrName, (error: any, result: boolean) => {
        if (error) {
          return resolve(false);
        }
        return resolve(result);
      });
    });
  }

  protected isAdminAsync(
    userName: string,
    done: (err: any, result: boolean) => void,
  ) {
    return this._isAdmin(userName)
      .then(
        result => done(undefined, result), // Cache falses
        error => done(error, false),
      );
  }

  public getProjectTeam(projectId: number): Promise<{id: number, name: string}> {
    return new Promise((resolve, reject) => {
      this.getProjectTeamAsync(projectId, (error?: any, result?: {id: number, name: string}) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      });
    });
  }

  protected getProjectTeamAsync(
    projectId: number,
    done: (err: any, result?: {id: number, name: string}) => void,
  ) {
    return this._getProjectTeam(projectId)
      .then(
        result => done(undefined, result),
        error => done(error),
      );
  }
}

export default CachedAuthenticationHapiPlugin;
