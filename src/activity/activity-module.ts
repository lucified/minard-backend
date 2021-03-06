import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';

import { COMMENT_ADDED_EVENT_TYPE, CommentAddedEvent } from '../comment';
import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentModule,
  MinardDeployment,
} from '../deployment';
import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { Event } from '../shared/events';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  createActivityEvent,
  MinardActivity,
  MinardCommentActivity,
  MinardDeploymentActivity,
} from './types';

export function toDbActivity(activity: MinardActivity) {
  const deployment = {
    ...activity.deployment,
    url: undefined,
    screenshot: undefined,
  };
  // Note: It could make sense to use toDbDeployment before storing the
  // related deployment here. However, we did not do it from the start, and
  // changing this would require us to transform existing json structures in the
  // databases.
  return {
    ...activity,
    deployment: JSON.stringify(deployment),
    commit: JSON.stringify(activity.commit),
    timestamp: activity.timestamp.valueOf(),
  };
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

  public constructor(
    @inject(DeploymentModule.injectSymbol)
    private readonly deploymentModule: DeploymentModule,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(eventBusInjectSymbol) private readonly eventBus: EventBus,
    @inject(charlesKnexInjectSymbol) private readonly knex: Knex,
  ) {
    this.subscribeForFinishedDeployments();
    this.subscribeForComments();
  }

  public async subscribeForFinishedDeployments() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(
        event =>
          event.payload.statusUpdate.status === 'failed' ||
          event.payload.statusUpdate.status === 'success',
      )
      .flatMap(event => this.handleFinishedDeployment(event))
      .subscribe();
  }

  public async subscribeForComments() {
    this.eventBus
      .filterEvents<CommentAddedEvent>(COMMENT_ADDED_EVENT_TYPE)
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

  public async createCommentActivity(
    event: CommentAddedEvent,
  ): Promise<MinardCommentActivity> {
    const deployment = await this.deploymentModule.getDeployment(
      event.deploymentId,
    );
    if (!deployment) {
      throw Error(
        `Could not get deployment ${event.deploymentId} for comment '${event.id}'`,
      );
    }
    return {
      ...createDeploymentRelatedActivity(deployment),
      activityType: 'comment',
      timestamp: event.createdAt,
      teamId: event.teamId,
      name: event.name,
      email: event.email,
      message: event.message,
      commentId: event.id,
    };
  }

  private async handleFinishedDeployment(event: Event<DeploymentEvent>) {
    try {
      const activity = this.createDeploymentActivity(event.payload);
      await this.addActivity(activity);
    } catch (error) {
      this.logger.error(
        'Failed to add activity based on deployment event',
        error,
      );
    }
  }

  public createDeploymentActivity(
    event: DeploymentEvent,
  ): MinardDeploymentActivity {
    const deployment = event.deployment;
    let timestamp = deployment.finishedAt;
    if (!timestamp) {
      this.logger.warn(
        `Finished deployment ${deployment.id} did not have finishedAt defined`,
      );
      timestamp = moment();
    }
    return {
      ...createDeploymentRelatedActivity(deployment),
      activityType: 'deployment',
      timestamp,
      teamId: event.teamId,
    };
  }

  public async addActivity(activity: MinardActivity): Promise<void> {
    const ids = await this.knex('activity')
      .insert(toDbActivity(activity))
      .returning('id');
    this.eventBus.post(createActivityEvent({ ...activity, id: ids[0] }));
  }

  private toMinardActivity(activity: any): MinardActivity {
    const _deployment = activity.deployment instanceof Object
      ? activity.deployment
      : JSON.parse(activity.deployment);
    const commit = activity.commit instanceof Object
      ? activity.commit
      : JSON.parse(activity.commit);
    const deployment = this.deploymentModule.toMinardDeployment(_deployment);
    return {
      ...activity,
      deployment,
      commit,
      timestamp: moment(Number(activity.timestamp)),
    };
  }

  public async getTeamActivity(
    teamId: number,
    until?: moment.Moment,
    count?: number,
  ): Promise<MinardActivity[]> {
    const select = this.knex
      .select('*')
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

  public async getProjectActivity(
    projectId: number,
    until?: moment.Moment,
    count?: number,
  ): Promise<MinardActivity[]> {
    const select = this.knex
      .select('*')
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
