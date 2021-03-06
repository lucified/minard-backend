import { inject, injectable } from 'inversify';

import { DeploymentModule } from '../deployment/';
import { externalBaseUrlInjectSymbol } from '../server/types';
import { toApiBranchId } from './conversions';
import { JsonApiModule } from './json-api-module';
import { serializeApiEntity } from './serialization';
import { PreviewView } from './types';

/*
 * Provides helpful endpoints for specific views
 */

@injectable()
export class ViewEndpoints {
  public static injectSymbol = Symbol('view-endpoints');

  constructor(
    @inject(JsonApiModule.injectSymbol) private readonly jsonApi: JsonApiModule,
    @inject(DeploymentModule.injectSymbol)
    private readonly deploymentModule: DeploymentModule,
    @inject(externalBaseUrlInjectSymbol) private readonly baseUrl: string,
  ) {}

  public async getPreview(
    projectId: number,
    deploymentId: number,
  ): Promise<PreviewView | null> {
    const _deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!_deployment) {
      return null;
    }
    const deployment = await this.jsonApi.toApiDeployment(
      projectId,
      _deployment,
    );
    const commit = await this.jsonApi.toApiCommit(
      projectId,
      _deployment.commit,
      [deployment],
    );
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
      deployment: serializeApiEntity('deployment', deployment, this.baseUrl)
        .data,
    };
  }
}
