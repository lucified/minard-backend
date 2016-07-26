
import { inject, injectable } from 'inversify';
import { GitlabClient } from '../shared/gitlab-client'
import { Deployment } from  '../shared/gitlab.d.ts'
const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line


@injectable()
export default class DeploymentModule {

  public static injectSymbol = Symbol('deployment-module');

  private gitlab: GitlabClient;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient) {
    this.gitlab = gitlab;
  }

  public fetchDeploymentsFromGitLab(projectId: number): Promise<Deployment[] | void> {
    return this.gitlab.fetchJson<Deployment[]>(`projects/${projectId}/builds`)
  };

  public async handleGetDeployments(projectId: number) {
    const gitlabData = await this.fetchDeploymentsFromGitLab(projectId);
    return DeploymentModule.gitlabResponseToJsonApi(gitlabData);
  }


  public static gitlabResponseToJsonApi(gitlabResponse: any) {
    const normalized = this.normalizeGitLabResponse(gitlabResponse);
    const opts = {
      attributes: ['finished_at', 'status', 'commit', 'user'],
      commit: {
        attributes: ['message'],
        ref: function (_: any, commit: any) {
            return String(commit.id);
        },
      },
      user: {
        attributes: ['username'],
        ref: function (_: any, user: any) {
            return String(user.id);
        },
      },
    };
    const serialized = new Serializer('deployment', opts).serialize(normalized);
    return serialized;
  };

  public static normalizeGitLabResponse(gitlabResponse: any) {
    return gitlabResponse.map((item: any) => {
      return {
        id: item.id,
        user: {
          id: item.user.id,
          username: item.user.username,
        },
        commit: {
          id: item.commit.id,
          message: item.commit.message,
        },
        finished_at: item.finished_at,
        status: item.status,
      };
    });
  };


};