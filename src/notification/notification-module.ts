
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
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
} from '../deployment';

import {
  minardUiBaseUrlInjectSymbol,
} from '../server/types';

import {
  FlowdockNotify,
} from './flowdock-notify';

import {
  FlowdockNotificationConfiguration,
  NotificationConfiguration,
} from './types';

import {
  getUiBranchUrl,
  getUiProjectUrl,
} from '../project';

@injectable()
export class NotificationModule {

  public static injectSymbol = Symbol('notification-module');

  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly knex: Knex;
  private readonly uiBaseUrl: string;
  private readonly flowdockNotify: FlowdockNotify;

  constructor(
    @inject(eventBusInjectSymbol) bus: EventBus,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject('charles-knex') knex: Knex,
    @inject(minardUiBaseUrlInjectSymbol) uiBaseUrl: string,
    @inject(FlowdockNotify.injectSymbol) flowdockNotify: FlowdockNotify) {
    this.eventBus = bus;
    this.logger = logger;
    this.knex = knex;
    this.uiBaseUrl = uiBaseUrl;
    this.flowdockNotify = flowdockNotify;
    this.subscribe();
  }

  private subscribe() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .subscribe(event => this.handleDeploymentEvent(event));
  }

  public addConfiguration(config: NotificationConfiguration): Promise<void> {
    return this.knex('notification_configuration')
      .insert(config);
  }

  public async getConfigurations(event: DeploymentEvent): Promise<NotificationConfiguration[]> {
    const select = this.knex.select('*')
      .from('notification_configuration')
      .where('projectId', event.deployment.projectId);
    return await select;
  }

  public notify(event: Event<DeploymentEvent>, config: NotificationConfiguration) {
    if (config.type === 'flowdock') {
      this.notifyFlowdock(event, config as FlowdockNotificationConfiguration);
    }
  }

  public async notifyFlowdock(event: Event<DeploymentEvent>, config: FlowdockNotificationConfiguration) {
    try {
      const { projectId, ref } = event.payload.deployment;
      const projectUrl = getUiProjectUrl(projectId, this.uiBaseUrl);
      const branchUrl = getUiBranchUrl(projectId, ref, this.uiBaseUrl);
      await this.flowdockNotify.notify(event.payload.deployment,
        config.flowToken, projectUrl, branchUrl);
    } catch (error) {
      this.logger.error(`Failed to send Flowdock notification for deployment`, { error, event });
    }
  }

  private async handleDeploymentEvent(event: Event<DeploymentEvent>) {
    try {
      const configs = await this.getConfigurations(event.payload);
      configs.forEach(item => this.notify(event, item));
    } catch (error) {
      this.logger.error(`Failed to send notifications for deployment`, { error, event });
    }
  }

}
