
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
} from './flowdock';

import {
  FlowdockNotificationConfiguration,
  NotificationConfiguration,
} from './types';

import {
  getUiBranchUrl,
  getUiProjectUrl,
} from '../project';

export function toDbNotificationConfiguration(config: NotificationConfiguration) {
  return Object.assign({}, config, {
    settings: JSON.stringify(config.options),
  });
}

export function toMinardNotificationConfiguration(config: any): NotificationConfiguration {
  const settings = config.settings instanceof Object ? config.settings : JSON.parse(config.settings);
  return Object.assign({}, config, {
    settings,
  }) as NotificationConfiguration;
}

@injectable()
export class NotificationModule {

  public static injectSymbol = Symbol('notification-module');

  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly knex: Knex;
  private readonly uiBaseUrl: string;

  constructor(
    @inject(eventBusInjectSymbol) bus: EventBus,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject('charles-knex') knex: Knex,
    @inject(minardUiBaseUrlInjectSymbol) uiBaseUrl: string) {
    this.eventBus = bus;
    this.logger = logger;
    this.knex = knex;
    this.uiBaseUrl = uiBaseUrl;
    this.subscribe();
  }

  private subscribe() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .subscribe(event => this.handleDeploymentEvent(event));
  }

  public addConfiguration(config: NotificationConfiguration): Promise<void> {
    return this.knex('notification_configuration')
      .insert(toDbNotificationConfiguration(config));
  }

  public async getConfigurations(event: DeploymentEvent): Promise<NotificationConfiguration[]> {
    const select = this.knex.select('*')
      .from('notification_configuration')
      .where('projectId', event.deployment.projectId);
    return (await select).map((item: any) => toMinardNotificationConfiguration(item));
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
      const notifier = new FlowdockNotify(event.payload.deployment,
        config.options.flowToken, projectUrl, branchUrl);
      await notifier.notify();
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
