import { inject, injectable } from 'inversify';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';
import { Cache, cacheInjectSymbol } from '../shared/cache';
import { gitBaseUrlInjectSymbol, GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { SystemHookModule } from '../system-hook';
import { GitlabPushEvent } from './gitlab-push-hook-types';
import ProjectModule from './project-module';
import { MinardProjectContributor } from './types';

function getProjectContributorsCacheKey(projectId: number) {
  return `${projectId}-contributors`;
}

@injectable()
export default class CachedProjectModule extends ProjectModule {
  constructor(
    @inject(AuthenticationModule.injectSymbol)
    authenticationModule: AuthenticationModule,
    @inject(SystemHookModule.injectSymbol) systemHookModule: SystemHookModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(gitBaseUrlInjectSymbol) gitBaseUrl: string,
    @inject(cacheInjectSymbol) private readonly cache: Cache,
  ) {
    super(
      authenticationModule,
      systemHookModule,
      eventBus,
      gitlab,
      logger,
      gitBaseUrl,
    );
  }

  public async getProjectContributors(
    projectId: number,
  ): Promise<MinardProjectContributor[] | null> {
    const key = getProjectContributorsCacheKey(projectId);
    const wrapper = () => this._getProjectContributors(projectId);
    return this.cache.wrap<MinardProjectContributor[] | null>(key, wrapper);
  }

  public async handlePushEvent(
    projectId: number,
    ref: string,
    payload: GitlabPushEvent,
  ) {
    await this.cache.del(getProjectContributorsCacheKey(projectId));
    return this._handlePushEvent(projectId, ref, payload);
  }

  // Provide wrappers for calls to super class
  // methods to make unit testing easier

  public async _getProjectContributors(projectId: number) {
    return super.getProjectContributors(projectId);
  }

  public async _handlePushEvent(
    projectId: number,
    ref: string,
    payload: GitlabPushEvent,
  ) {
    return super.handlePushEvent(projectId, ref, payload);
  }
}
