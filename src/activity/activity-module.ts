
import { inject, injectable } from 'inversify';

import { DeploymentModule, MinardDeployment } from '../deployment';
import * as logger from  '../shared/logger';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
}

export interface MinardActivityPlain {
  projectId: number;
  teamId: number;
  timestamp: string;
  type: string;
}

@injectable()
export default class ActivityModule {

  public static injectSymbol = Symbol('activity-module');

  private readonly deploymentModule: DeploymentModule;
  private readonly logger: logger.Logger;

  public constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.deploymentModule = deploymentModule;
    this.logger = logger;
  }

  public async getTeamActivity(teamId: number): Promise<MinardActivity[] | null> {
    return [] as MinardActivity[];
  }

  public async getProjectActivity(projectId: number): Promise<MinardActivity[] | null> {
    // TODO
    return [] as MinardActivity[];
  }

  public async getSingleActivity(activityId: string): Promise<MinardActivity | null> {
    // TODO
    return {} as MinardActivity;
  }

}
