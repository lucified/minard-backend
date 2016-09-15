
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';

import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentModule,
} from '../deployment';

import {
  Event,
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import { ProjectModule } from '../project';
import * as logger from  '../shared/logger';

import {
  MinardActivity,
  createActivityEvent,
} from './types';

export function toMinardActivity(activity: any): MinardActivity {
  // when using postgres driver, we get objects,
  // when using nosql, we get strings
  const deployment = activity.deployment instanceof Object ? activity.deployment : JSON.parse(activity.deployment);
  const commit = activity.commit instanceof Object ? activity.commit : JSON.parse(activity.commit);
  return Object.assign({}, activity, {
    deployment,
    commit,
    timestamp: moment(Number(activity.timestamp)),
  }) as MinardActivity;
}

export function toDbActivity(activity: MinardActivity) {
  return Object.assign({}, activity, {
    deployment: JSON.stringify(activity.deployment),
    commit: JSON.stringify(activity.commit),
    timestamp: activity.timestamp.valueOf(),
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
    @inject('charles-knex') knex: Knex) {
    this.projectModule = projectModule;
    this.deploymentModule = deploymentModule;
    this.logger = logger;
    this.eventBus = eventBus;
    this.knex = knex;
    this.subscribeForFinishedDeployments();
  }

  public async subscribeForFinishedDeployments() {
    this.eventBus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.statusUpdate === 'failed' || event.payload.statusUpdate === 'success')
      .flatMap(event => this.handleFinishedDeployment(event))
      .subscribe();
  }

  private async handleFinishedDeployment(event: Event<DeploymentEvent>) {
    try {
      const activity = this.createDeploymentActivity(event.payload);
      await this.addActivity(activity);
    } catch (error) {
      this.logger.error('Failed to add activity based on deployment event', { error, event });
    }
  }

  public createDeploymentActivity(event: DeploymentEvent): MinardActivity {
    const deployment = event.deployment;
    const branch = deployment.ref;
    const commit = deployment.commit;

    let timestamp = deployment.finishedAt;
    if (!timestamp) {
      this.logger.warn(`Finished deployment ${deployment.deploymentId} did not have finishedAt defined`);
      timestamp = moment();
    }

    return {
      activityType: 'deployment',
      projectId: deployment.projectId,
      projectName: deployment.projectName,
      branch,
      commit,
      timestamp,
      deployment,
      teamId: 1,
    };
  }

  public async addActivity(activity: MinardActivity): Promise<void> {
    await this.knex('activity').insert(toDbActivity(activity));
    this.eventBus.post(createActivityEvent(activity));
  }

  public async getTeamActivity(teamId: number, until?: moment.Moment, count?: number): Promise<MinardActivity[]> {
    const select = this.knex.select('*')
      .from('activity')
      .where('teamId', teamId);
    if (until) {
      select.andWhere('timestamp', '<=', until.valueOf());
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
      select.andWhere('timestamp', '<=', until.valueOf());
    }
    select.orderBy('timestamp', 'DESC');
    if (count) {
      select.limit(count);
    }
    return (await select).map(toMinardActivity);
  }

}
