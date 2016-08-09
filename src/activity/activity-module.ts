
import { inject, injectable } from 'inversify';
import { flatMap } from 'lodash';
import * as moment from 'moment';

import { DeploymentModule, MinardDeployment } from '../deployment';
import ProjectModule from '../project/project-module';

import * as logger from  '../shared/logger';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
}

export interface MinardActivityPlain {
  projectId: number;
  timestamp: string;
  activityType: string;
}

@injectable()
export default class ActivityModule {

  public static injectSymbol = Symbol('activity-module');

  private readonly projectModule: ProjectModule;
  private readonly deploymentModule: DeploymentModule;
  private readonly logger: logger.Logger;

  public constructor(
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.projectModule = projectModule;
    this.deploymentModule = deploymentModule;
    this.logger = logger;
  }

  public async getTeamActivity(teamId: number): Promise<MinardActivity[] | null> {
    const projects = await this.projectModule.getProjects(teamId);
    const nestedActivity = await Promise.all(projects.map(item => this.getProjectActivity(item.id)));
    const activity = flatMap<MinardActivity>(nestedActivity, (item) => item);
    const sortFunction = (a: any, b: any) => moment(b.timestamp).diff(moment(a.timestamp));
    activity.sort(sortFunction);
    return activity;
  }

  public async getProjectActivity(projectId: number): Promise<MinardActivity[] | null> {
    const deploymentsPromise = this.deploymentModule.getProjectDeployments(projectId);
    const deployments = await deploymentsPromise;
    return deployments.map((item: MinardDeployment) => {
      return {
        projectId: projectId,
        timestamp: item.finished_at,
        activityType: 'deployment',
        deployment: item,
      };
    });
  }

}
