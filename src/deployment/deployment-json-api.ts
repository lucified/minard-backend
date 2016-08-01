
import { inject, injectable } from 'inversify';

import DeploymentModule from './deployment-module';
const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

export function toJsonApi(deployments: any) {
  const opts = {
    attributes: ['finished_at', 'status', 'commit', 'user', 'url'],
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
  const serialized = new Serializer('deployment', opts).serialize(deployments);
  return serialized;
};

@injectable()
export default class DeploymentJsonApi {

  public static injectSymbol = Symbol('deployment-json-api');

  private deploymentModule: DeploymentModule;

  public constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule) {
    this.deploymentModule = deploymentModule;
  }

  public async getProjectDeployments(projectId: number) {
    const deployments = await this.deploymentModule.getProjectDeployments(projectId);
    return toJsonApi(deployments);
  }

  public async getDeployment(projectId: number, deploymentId: number) {
    const deployment = await this.deploymentModule.getDeployment(projectId, deploymentId);
    return toJsonApi(deployment);
  }

}
