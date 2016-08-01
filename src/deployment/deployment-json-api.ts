
import { inject, injectable } from 'inversify';

import { standardIdRef } from '../shared/json-api-serialisation';
import DeploymentModule from './deployment-module';

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

export const commitSerialization = {
  commits: {
    attributes: ['message', 'author', 'branch'],
    ref: standardIdRef,
  },
};

export const deploymentSerialization = {
  attributes: ['finished_at', 'status', 'commit', 'user', 'url'],
  commit: {
    attributes: ['message'],
    ref: standardIdRef,
  },
  user: {
    attributes: ['username'],
    ref: standardIdRef,
  },
};

export function toJsonApi(deployments: any) {
  const serialized = new Serializer('deployment', deploymentSerialization)
    .serialize(deployments);
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
