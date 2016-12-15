import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import {
  Logger,
  loggerInjectSymbol,
} from '../shared/logger';

import {
  Event,
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import {
  MinardActivity,
  MinardCommentActivity,
  NEW_ACTIVITY,
} from '../activity';

import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  MinardDeployment,
} from '../deployment';

import {
  minardUiBaseUrlInjectSymbol,
} from '../server/types';

import {
  HipchatNotify,
} from './hipchat-notify';

import {
  FlowdockNotify,
} from './flowdock-notify';

import {
  FlowdockNotificationConfiguration,
  HipChatNotificationConfiguration,
  NotificationConfiguration,
} from './types';

import {
  getUiBranchUrl,
  getUiProjectUrl,
} from '../project';

import {
  ScreenshotModule,
} from '../screenshot';

// type for events that trigger notifications
type NotificationEvent = DeploymentEvent | MinardActivity;

function getComment(event: NotificationEvent) {
  if ((event as MinardActivity).activityType === 'comment') {
    const activityEvent = event as MinardCommentActivity;
    return {
      name: activityEvent.name,
      email: activityEvent.email,
      message: activityEvent.message,
    };
  }
  return undefined;
}

@injectable()
export class NotificationModule {

  public static injectSymbol = Symbol('notification-module');

  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly knex: Knex;
  private readonly uiBaseUrl: string;
  private readonly flowdockNotify: FlowdockNotify;
  private readonly screenshotModule: ScreenshotModule;
  private readonly hipchatNotify: HipchatNotify;

  constructor(
    @inject(eventBusInjectSymbol) bus: EventBus,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject('charles-knex') knex: Knex,
    @inject(minardUiBaseUrlInjectSymbol) uiBaseUrl: string,
    @inject(FlowdockNotify.injectSymbol) flowdockNotify: FlowdockNotify,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(HipchatNotify.injectSymbol) hipchatNotify: HipchatNotify) {
    this.eventBus = bus;
    this.logger = logger;
    this.knex = knex;
    this.uiBaseUrl = uiBaseUrl;
    this.flowdockNotify = flowdockNotify;
    this.hipchatNotify = hipchatNotify;
    this.screenshotModule = screenshotModule;
    this.subscribe();
  }

  private subscribe() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      // only post event if status changes
      .filter(event => event.payload.statusUpdate.status !== undefined)
      .flatMap(event => this.handleEvent(event))
      .subscribe();

    this.eventBus
      .filterEvents<MinardActivity>(NEW_ACTIVITY)
      .filter(event => event.payload.activityType === 'comment')
      .flatMap(event => this.handleEvent(event))
      .subscribe();
  }

  public async deleteConfiguration(id: number): Promise<void> {
    try {
      await this.knex.delete()
        .from('notification_configuration')
        .where('id', id);
    } catch (error) {
      this.logger.error('Failed to delete notification configuration', error);
      throw Boom.badImplementation();
    }
  }

  public async addConfiguration(config: NotificationConfiguration): Promise<number> {
    try {
      const ids = await this.knex('notification_configuration').insert(config).returning('id');
      return ids[0];
    } catch (error) {
      this.logger.error('Failed to add notification configuration', error);
      throw Boom.badImplementation();
    }
  }

  public async getConfiguration(id: number): Promise<NotificationConfiguration | undefined> {
    try {
      return this.knex.select('*')
        .from('notification_configuration')
        .where('id', id)
        .limit(1)
        .first();
    } catch (error) {
      this.logger.error('Failed to get notification configuration', error);
      throw Boom.badImplementation();
    }
  }

  public async getTeamConfigurations(teamId: number): Promise<NotificationConfiguration[]> {
    if (!teamId) {
      throw Boom.badRequest('teamId must be defined');
    }
    try {
      const select = this.knex.select('*')
        .from('notification_configuration')
        .where('teamId', teamId);
      const ret = await select;
      return ret ? ret : [];
    } catch (error) {
      this.logger.error('Failed to fetch notification configurations', error);
      throw Boom.badImplementation();
    }
  }

  public async getProjectConfigurations(projectId: number): Promise<NotificationConfiguration[]> {
    if (!projectId) {
      throw Boom.badRequest('projectId must be defined');
    }
    try {
      const select = this.knex.select('*')
        .from('notification_configuration')
        .where('projectId', projectId);
      const ret = await select;
      return ret ? ret : [];
    } catch (error) {
      this.logger.error('Failed to fetch notification configurations', error);
      throw Boom.badImplementation();
    }
  }

  public async notify(event: Event<NotificationEvent>, config: NotificationConfiguration): Promise<void> {
    if (config.type === 'flowdock') {
      return this.notifyFlowdock(event, config as FlowdockNotificationConfiguration);
    } else if (config.type === 'hipchat') {
      return this.notifyHipchat(event, config as HipChatNotificationConfiguration);
    }
  }

  public async getScreenshotDataUri(event: Event<NotificationEvent>) {
     const { projectId, id, screenshot } = event.payload.deployment;
     return screenshot ? this.screenshotModule.getDataUrl(projectId, id) : undefined;
  }

  public async getScreenshotData(event: Event<NotificationEvent>) {
     const { projectId, id, screenshot } = event.payload.deployment;
     return screenshot ? this.screenshotModule.getScreenshotData(projectId, id) : undefined;
  }

  public async notifyHipchat(event: Event<NotificationEvent>, config: HipChatNotificationConfiguration) {
    try {
      const { projectId, ref } = event.payload.deployment;
      const projectUrl = getUiProjectUrl(projectId, this.uiBaseUrl);
      const branchUrl = getUiBranchUrl(projectId, ref, this.uiBaseUrl);
      const deployment = event.payload.deployment;
      const comment = getComment(event.payload);
      await this.hipchatNotify.notify(
        deployment,
        config.hipchatRoomId,
        config.hipchatAuthToken,
        projectUrl,
        branchUrl,
        comment);
    } catch (error) {
      this.logger.error(`Failed to send Hipchat notification`, error);
    }
  }

  public async notifyFlowdock(event: Event<NotificationEvent>, config: FlowdockNotificationConfiguration) {
    try {
      const { projectId, ref } = event.payload.deployment;
      const projectUrl = getUiProjectUrl(projectId, this.uiBaseUrl);
      const branchUrl = getUiBranchUrl(projectId, ref, this.uiBaseUrl);
      const deployment = Object.assign({}, event.payload.deployment,
        { screenshot: await this.getScreenshotData(event) }) as MinardDeployment;
      const comment = getComment(event.payload);
      await this.flowdockNotify.notify(deployment, config.flowToken, projectUrl, branchUrl, comment);
    } catch (error) {
      this.logger.error(`Failed to send Flowdock notification`, error);
    }
  }

  private async getConfigurations(projectId: number, teamId: number) {
    let configs = await this.getProjectConfigurations(projectId);
    if (configs.length === 0) {
      configs = await this.getTeamConfigurations(teamId);
    }
    return configs;
  }

  private async handleEvent(event: Event<NotificationEvent>) {
    const teamId = event.payload.deployment.teamId;
    const projectId = event.payload.deployment.projectId;
    try {
      const configs = await this.getConfigurations(projectId, teamId);
      await Promise.all(configs.map(item => this.notify(event, item)));
    } catch (error) {
      this.logger.error(`Failed to send notifications`, error);
    }
  }

}
