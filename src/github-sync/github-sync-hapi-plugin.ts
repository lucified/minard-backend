import { badGateway, notFound } from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import { stringify } from 'querystring';

import { AuthenticationModule } from '../authentication';

import { ProjectModule } from '../project';
import { HapiRegister } from '../server/hapi-register';
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
export default class GitHubSyncPlugin {
  public static injectSymbol = Symbol('github-sync');
  public failSleepTime = 2000;

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
  ) {
    this.register.attributes = {
      name: 'github-sync-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'POST',
      path: '/webhook/{projectId}/{token}',
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            token: Joi.string().required(),
          },
        },
        auth: false,
      },
      handler: {
        async: async (request: any, reply: any) => {
          const { projectId, token } = request.params;
          await this.receiveGitHubHook(projectId, token, request.payload);
          return reply('ok');
        },
      },
    });
    next();
  };

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

    const project = await this.projectModule.getProject(projectId);
    if (!project) {
      this.logger.warn(`Project ${projectId} was not found  in GitHub webhook`);
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
