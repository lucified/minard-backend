
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';

import { toGitlabStamp, toMoment } from '../shared/time-conversion';

import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentModule,
} from '../deployment';

import {
  SCREENSHOT_EVENT_TYPE,
  ScreenshotEvent,
} from '../screenshot';

import {
  Event,
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import { ProjectModule } from '../project';
import * as logger from  '../shared/logger';
import { MinardActivity } from './types';

export function toMinardActivity(activity: any): MinardActivity {
  return Object.assign({}, activity, {
    deployment: JSON.parse(activity.deployment),
    commit: JSON.parse(activity.commit),
    timestamp: moment(activity.timestamp),
  }) as MinardActivity;
}

export function toDbActivity(activity: MinardActivity) {
  return Object.assign({}, activity, {
    deployment: JSON.stringify(activity.deployment),
    commit: JSON.stringify(activity.commit),
    timestamp: activity.timestamp.toDate().getTime(),
  });
}

@injectable()
export default class ActivityModule {

  public static injectSymbol = Symbol('activity-module');

  private readonly projectModule: ProjectModule;
  private readonly deploymentModule: DeploymentModule;
  private readonly logger: logger.Logger;
  private readonly knex: Knex;
  private readonly eventBus: EventBus;

  public constructor(
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject('') knex: Knex) {
    this.projectModule = projectModule;
    this.deploymentModule = deploymentModule;
    this.logger = logger;
    this.eventBus = eventBus;
    this.knex = knex;
    this.subscribeForFailedDeployments();
    this.subscribeForSuccessfulDeployments();
  }

  public async subscribeForFailedDeployments() {
    this.eventBus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.status === 'failed')
      .flatMap(event => this.handleFailedDeployment(event))
      .subscribe();
  }

  private async handleFailedDeployment(event: Event<DeploymentEvent>) {
    try {
      const projectId = event.payload.projectId;
      const deploymentId = event.payload.id;
      if (!projectId) {
        throw Boom.badImplementation();
      }
      const activity = await this.createDeploymentActivity(projectId, deploymentId);
      activity.deployment.status = 'failed';
      await this.addActivity(activity);
    } catch (err) {
      this.logger.error('Failed to add activity based on failed deployment event', err);
    }
  }

  public async subscribeForSuccessfulDeployments() {
    this.eventBus.filterEvents<ScreenshotEvent>(SCREENSHOT_EVENT_TYPE)
      .flatMap(event => this.handleSuccessfulDeployment(event))
      .subscribe();
  }

  private async handleSuccessfulDeployment(event: Event<ScreenshotEvent>) {
    try {
      const activity = await this.createDeploymentActivity(event.payload.projectId, event.payload.deploymentId);
      activity.deployment.status = 'success';
      activity.deployment.screenshot = event.payload.url;
      await this.addActivity(activity);
    } catch (err) {
      this.logger.error('Failed to add activity based on screenshot event', err);
    }
  }

  public async createDeploymentActivity(projectId: number, deploymentId: number): Promise<MinardActivity> {
    const [ project, deployment ] = await Promise.all([
      this.projectModule.getProject(projectId),
      this.deploymentModule.getDeployment(projectId, deploymentId),
    ]);
    if (!project || !deployment) {
      throw Boom.badImplementation();
    }
    const branch = deployment.ref;
    const commit = this.projectModule.toMinardCommit(deployment.commitRef);
    // This is a bit clumsy, but gitlab may not have yet updated its finished_at info
    // when we are creating this event. Thus we set the field to the current date
    // if the info is not included in the deployment
    const finishedAt = deployment.finished_at = deployment.finished_at || toGitlabStamp(moment());
    return {
      activityType: 'deployment',
      projectId,
      projectName: project.name,
      branch,
      commit,
      timestamp: toMoment(finishedAt),
      deployment,
      teamId: 1,
    };
  }

  public async addActivity(activity: MinardActivity) {
    await this.knex('activity').insert(toDbActivity(activity));
  }

  public async getTeamActivity(teamId: number, until?: moment.Moment, count?: number): Promise<MinardActivity[]> {
    const select = this.knex.select('*')
      .from('activity')
      .where('teamId', teamId);
    if (until) {
      select.andWhere('timestamp', '<=', until.toDate().getTime());
    }
    select.orderBy('timestamp', 'DESC');
    if (count) {
      select.limit(count);
    }
    return (await select).map(toMinardActivity);
  }

  public async getProjectActivity(projectId: number, until?: moment.Moment, count?: number): Promise<MinardActivity[]> {
    const select = this.knex.select('*')
      .from('activity')
      .where('projectId', projectId);
    if (until) {
      select.andWhere('timestamp', '<=', until.toDate().getTime());
    }
    select.orderBy('timestamp', 'DESC');
    if (count) {
      select.limit(count);
    }
    return (await select).map(toMinardActivity);
  }

}
