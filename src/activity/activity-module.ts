
import { inject, injectable } from 'inversify';
import { flatMap } from 'lodash';
import * as moment from 'moment';

import { DeploymentModule, MinardDeployment } from '../deployment';
import { ProjectModule } from '../project';
import * as logger from  '../shared/logger';
import { MinardActivity } from './types';

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
    const [ project, deployments ] = await Promise.all([
      this.projectModule.getProject(projectId),
      this.deploymentModule.getProjectDeployments(projectId),
    ]);
    if (!project) {
      return null;
    }
    return deployments.map((deployment: MinardDeployment) => {
      const branch = {
        id: `projectId-${deployment.ref}`,
        name: deployment.ref,
      };
      return {
        project,
        branch,
        projectId,
        timestamp: deployment.finished_at,
        activityType: 'deployment',
        deployment,
      };
    });
  }

}
