import { badGateway, notFound } from 'boom';
import { inject, injectable } from 'inversify';
import { stringify } from 'querystring';

import { AuthenticationModule } from '../authentication';
import { ProjectModule } from '../project';
import TokenGenerator from '../shared/token-generator';

import { isGitHubConfiguration, NotificationModule } from '../notification';
import {
  getGitHubAppInstallationAccessToken,
  getGitHubAppJWT,
} from '../notification/github-notify';
import { IFetch } from '../shared/fetch';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';
import {
  GitHubWebHookPayload,
  gitSyncerBaseUrlInjectSymbol,
} from './types';

@injectable()
export default class GitHubSyncModule {
  public static injectSymbol = Symbol('github-sync-module');

  constructor(
    @inject(AuthenticationModule.injectSymbol)
    private readonly authenticationModule: AuthenticationModule,
    @inject(ProjectModule.injectSymbol)
    private readonly projectModule: ProjectModule,
    @inject(NotificationModule.injectSymbol)
    private readonly notificationModule: NotificationModule,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
    @inject(gitlabHostInjectSymbol) private readonly gitlabHost: string,
    @inject(gitSyncerBaseUrlInjectSymbol)
    private readonly gitSyncerBaseUrl: string,
    @inject(TokenGenerator.injectSymbol)
    private readonly tokenGenerator: TokenGenerator,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {}

  public async getTeamGitHubToken(teamId: number): Promise<string | undefined> {
    const configs = await this.notificationModule.getTeamConfigurations(teamId);
    const githubConfig = configs.find(c => c.type === 'github');
    if (isGitHubConfiguration(githubConfig)) {
      const { githubInstallationId } = githubConfig;
      const { appId, appPrivateKey } = this.notificationModule.githubNotify;
      const jwt = await getGitHubAppJWT(appId, appPrivateKey);
      const token = (await getGitHubAppInstallationAccessToken(
        githubInstallationId,
        jwt,
      )).token;
      return token;
    }
    return undefined;
  }

  public async teamHasGitHubToken(teamId: number): Promise<boolean> {
    return !!await this.getTeamGitHubToken(teamId);
  }

  public async getWebHookUrl(
    teamId: number,
    projectId: number,
    externalBaseUrl: string,
  ) {
    return this.teamHasGitHubToken(teamId)
      ? webhookUrl(projectId, this.tokenGenerator, externalBaseUrl)
      : undefined;
  }

  public async receiveGitHubHook(
    projectId: number,
    token: string,
    payload: GitHubWebHookPayload,
  ) {
    if (this.tokenGenerator.projectWebhookToken(projectId) !== token) {
      this.logger.warn(
        `Invalid signature token in project webhook for project ${projectId}`,
      );
      throw notFound();
    }

    if (!payload.ref) {
      return;
    }

    const project = await this.projectModule.getProject(projectId);
    if (!project) {
      this.logger.warn(
        `Project ${projectId} was not found while processing GitHub webhook`,
      );
      throw notFound();
    }

    const githubToken = await this.getTeamGitHubToken(project.teamId);
    if (!githubToken) {
      this.logger.warn(
        `No token was found for team ${project.teamId} owning project ${projectId}. GitHub webhook will be ignored`,
      );
      throw notFound();
    }

    const params = {
      source: payload.repository.clone_url,
      target: `${this.gitlabHost}/${project.namespacePath}/${project.path}.git`,
      sourceUsername: githubToken,
      targetUsername: 'root',
      targetPassword: this.authenticationModule.getRootPassword(),
    };

    const url = `${this.gitSyncerBaseUrl}/sync?${stringify(params)}`;
    const response = await this.fetch(url, {
      body: JSON.stringify(payload),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      this.logger.warn(`Sync failed with status ${response.status}`);
      throw badGateway();
    }
  }
}

export function webhookUrl(
  projectId: number,
  tokenGenerator: TokenGenerator,
  externalBaseUrl: string,
) {
  return `${externalBaseUrl}/webhook/${projectId}/${tokenGenerator.projectWebhookToken(
    projectId,
  )}`;
}
