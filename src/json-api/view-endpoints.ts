
import { inject, injectable } from 'inversify';

import { externalBaseUrlInjectSymbol } from '../server/types';

import {
  PreviewView,
} from './types';

import {
  DeploymentModule,
} from '../deployment/';

import {
  JsonApiModule,
} from './json-api-module';

import {
  toApiBranchId,
} from './conversions';

import {
  serializeApiEntity,
} from './serialization';

/*
 * Provides helpful endpoints for specific views
 */

@injectable()
export class ViewEndpoints {

  public static injectSymbol = Symbol('view-endpoints');

  private readonly deploymentModule: DeploymentModule;
  private readonly jsonApi: JsonApiModule;
  private readonly baseUrl: string;

  constructor(
    @inject(JsonApiModule.injectSymbol) jsonApiModule: JsonApiModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
      this.jsonApi = jsonApiModule;
      this.deploymentModule = deploymentModule;
      this.baseUrl = baseUrl + '/api';
  }

  public async getPreview(projectId: number, deploymentId: number): Promise<PreviewView | null> {
     const _deployment = await this.deploymentModule.getDeployment(deploymentId);
     if (!_deployment) {
       return null;
     }
     const deployment = await this.jsonApi.toApiDeployment(projectId, _deployment);
     const commit = await this.jsonApi.toApiCommit(projectId, _deployment.commit, [ deployment ]);

     return {
       project: {
         id: String(projectId),
         name: _deployment.projectName,
       },
       branch: {
         id: toApiBranchId(projectId, _deployment.ref),
         name: _deployment.ref,
       },
       commit: serializeApiEntity('commit', commit, this.baseUrl).data,
       deployment: serializeApiEntity('deployment', deployment, this.baseUrl).data,
     };
  }

}
