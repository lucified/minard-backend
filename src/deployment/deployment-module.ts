
import { inject, injectable } from 'inversify';

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

import UserModule from '../user/user-module'; // only for types


@injectable()
export default class DeploymentModule {

  public static injectSymbol = Symbol('deployment-module');

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

  private gitlabBaseUrl: string;
  private userModule: UserModule;

  public constructor(
    @inject('gitlab-base-url') gitlabBaseUrl: string,
    @inject(UserModule.injectSymbol) userModule: UserModule) {
    this.gitlabBaseUrl = gitlabBaseUrl;
    this.userModule = userModule;
  }

  public async fetchDeploymentsFromGitLab(projectId: number) {
    const privateToken = await this.userModule.getPrivateAuthenticationToken(1);
    const url = `${this.gitlabBaseUrl}/api/v3/projects/` +
      `${projectId}/builds?private_token=${privateToken}`;
    const response = await fetch(url);
    if (response.status !== 200) {
      // TODO: handle errors correctly
      console.log(`Gitlab status code was ${response.status}`);
      return { };
    }
    return response.json();
  };

  public async handleGetDeployments(projectId: number) {
    const gitlabData = await this.fetchDeploymentsFromGitLab(projectId);
    return DeploymentModule.gitlabResponseToJsonApi(gitlabData);
  }

};



