
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';

import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentModule,
  MinardDeployment,
} from '../deployment';

import {
  COMMENT_ADDED_EVENT_TYPE,
  CommentAddedEvent,
} from '../comment';

import {
  Event,
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import * as logger from '../shared/logger';
import { charlesKnexInjectSymbol } from '../shared/types';

import {
  createActivityEvent,
  MinardActivity,
  MinardCommentActivity,
  MinardDeploymentActivity,
} from './types';

export function toDbActivity(activity: MinardActivity) {
  const deployment = Object.assign({}, activity.deployment, { url: undefined, screenshot: undefined });
  // Note: It could make sense to use toDbDeployment before storing the
  // related deployment here. However, we did not do it from the start, and
  // changing this would require us to transform existing json structures in the
  // databases.
  return Object.assign({}, activity, {
    deployment: JSON.stringify(deployment),
    commit: JSON.stringify(activity.commit),
    timestamp: activity.timestamp.valueOf(),
  });
}

function createDeploymentRelatedActivity(deployment: MinardDeployment) {
  const branch = deployment.ref;
  const commit = deployment.commit;
  return {
    activityType: 'deployment',
    projectId: deployment.projectId,
    projectName: deployment.projectName,
    branch,
    commit,
    deployment,
  };
}

@injectable()
export default class ActivityModule {

  public static injectSymbol = Symbol('activity-module');

  private readonly deploymentModule: DeploymentModule;
  private readonly logger: logger.Logger;
  private readonly knex: Knex;
  private readonly eventBus: EventBus;

  public constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(charlesKnexInjectSymbol) knex: Knex) {
    this.deploymentModule = deploymentModule;
    this.logger = logger;
    this.eventBus = eventBus;
    this.knex = knex;
    this.subscribeForFinishedDeployments();
    this.subscribeForComments();
  }

  public async subscribeForFinishedDeployments() {
    this.eventBus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.statusUpdate.status === 'failed'
        || event.payload.statusUpdate.status === 'success')
      .flatMap(event => this.handleFinishedDeployment(event))
      .subscribe();
  }

  public async subscribeForComments() {
    this.eventBus.filterEvents<CommentAddedEvent>(COMMENT_ADDED_EVENT_TYPE)
      .flatMap(event => this.handleCommentAdded(event))
      .subscribe();
  }

  // internal method
  public async handleCommentAdded(event: Event<CommentAddedEvent>) {
    try {
      const activity = await this.createCommentActivity(event.payload);
      await this.addActivity(activity);
    } catch (error) {
      this.logger.error('Failed to add activity based on ', error);
    }
  }

  public async createCommentActivity(event: CommentAddedEvent): Promise<MinardCommentActivity> {
    const deployment = await this.deploymentModule.getDeployment(event.deploymentId);
    if (!deployment) {
      throw Error(`Could not get deployment ${event.deploymentId} for comment '${event.id}'`);
    }
    return Object.assign(createDeploymentRelatedActivity(deployment), {
      activityType: 'comment' as 'deployment' | 'comment',
      timestamp: event.createdAt,
      teamId: event.teamId,
      name: event.name,
      email: event.email,
      message: event.message,
      commentId: event.id,
    });
  }

  private async handleFinishedDeployment(event: Event<DeploymentEvent>) {
    try {
      const activity = this.createDeploymentActivity(event.payload);
      await this.addActivity(activity);
    } catch (error) {
      this.logger.error('Failed to add activity based on deployment event', error);
    }
  }

  public createDeploymentActivity(event: DeploymentEvent): MinardDeploymentActivity {
    const deployment = event.deployment;
    let timestamp = deployment.finishedAt;
    if (!timestamp) {
      this.logger.warn(`Finished deployment ${deployment.id} did not have finishedAt defined`);
      timestamp = moment();
    }
    return Object.assign(createDeploymentRelatedActivity(deployment), {
      activityType: 'deployment' as 'deployment' | 'comment',
      timestamp,
      teamId: event.teamId,
    });
  }

  public async addActivity(activity: MinardActivity): Promise<void> {
    const ids = await this.knex('activity').insert(toDbActivity(activity)).returning('id');
    this.eventBus.post(createActivityEvent(Object.assign({}, activity, { id: ids[0] })));
  }

  private toMinardActivity(activity: any) {
    const _deployment = activity.deployment instanceof Object ? activity.deployment : JSON.parse(activity.deployment);
    const commit = activity.commit instanceof Object ? activity.commit : JSON.parse(activity.commit);
    const deployment = this.deploymentModule.toMinardDeployment(_deployment);
    return Object.assign({}, activity, {
      deployment,
      commit,
      timestamp: moment(Number(activity.timestamp)),
    }) as MinardActivity;
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
    return (await select).map((item: any) => this.toMinardActivity(item));
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
    return (await select).map((item: any) => this.toMinardActivity(item));
  }

}
