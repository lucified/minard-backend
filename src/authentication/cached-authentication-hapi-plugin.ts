import * as Boom from 'boom';
import * as auth from 'hapi-auth-jwt2';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { IFetch } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import {
  adminTeamNameInjectSymbol,
  charlesKnexInjectSymbol,
  fetchInjectSymbol,
  openTeamNameInjectSymbol,
} from '../shared/types';
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
    @inject(openTeamNameInjectSymbol) openTeamName: string,
    @inject(fetchInjectSymbol) fetch: IFetch,
  ) {
    super(
      gitlab,
      hapiOptions,
      authCookieDomain,
      db,
      logger,
      adminTeamName,
      openTeamName,
      fetch,
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
    this.isOpenDeploymentAsync = memoizee(
      this.isOpenDeploymentAsync,
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

  public isOpenDeployment(projectId: number, _deploymentId: number) {
    return new Promise((resolve, _reject) => {
      this.isOpenDeploymentAsync(projectId, (error: any, result: boolean) => {
        if (error) {
          return resolve(false);
        }
        return resolve(result);
      });
    });
  }

  protected isOpenDeploymentAsync(
    projectId: number,
    done: (err: any, result: boolean) => void,
  ) {
    return this._isOpenDeployment(projectId, 1) // Use the knowledge that the deployment id doesn\'t matter
      .then(
        result => done(undefined, result), // Cache falses
        error => done(error, false),
      );
  }
}

export default CachedAuthenticationHapiPlugin;
