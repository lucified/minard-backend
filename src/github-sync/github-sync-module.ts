import { badGateway, notFound } from 'boom';
import { inject, injectable } from 'inversify';
import { stringify } from 'querystring';

import { AuthenticationModule } from '../authentication';
import { ProjectModule } from '../project';
import TokenGenerator from '../shared/token-generator';

import { IFetch } from '../shared/fetch';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';
import { parseGitHubTokens } from './parse-github-tokens';
import {
  githubTokensInjectSymbol,
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
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
    @inject(gitlabHostInjectSymbol) private readonly gitlabHost: string,
    @inject(githubTokensInjectSymbol) private readonly githubTokens: string,
    @inject(gitSyncerBaseUrlInjectSymbol)
    private readonly gitSyncerBaseUrl: string,
    @inject(TokenGenerator.injectSymbol)
    private readonly tokenGenerator: TokenGenerator,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {}

  // the below methods are async because they might have to be async in the future
  // if we need to fetch this from a database, i.e.
  public async getTeamGitHubToken(teamId: number): Promise<string | undefined> {
    const parsedTokens = parseGitHubTokens(this.githubTokens);
    const githubToken = parsedTokens[teamId];
    return githubToken;
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

    const parsedTokens = parseGitHubTokens(this.githubTokens);
    const githubToken = parsedTokens[project.teamId];
    if (!githubToken) {
      this.logger.warn(
        `No token was found for team ${project.teamId} owning project ${projectId} GitHub webhook will be ignored`,
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

    const url = `${this.gitSyncerBaseUrl}/sync-query?${stringify(params)}`;
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
