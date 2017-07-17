import { Observable } from '@reactivex/rxjs';
import { badImplementation, badRequest } from 'boom';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import { isNil, omitBy } from 'lodash';

import { isCommentActivity, MinardActivity, NEW_ACTIVITY } from '../activity';
import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  getUiCommentUrl,
  getUiDeploymentPreviewUrl,
  MinardDeployment,
} from '../deployment';
import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { getUiBranchUrl, getUiProjectUrl } from '../project';
import { ScreenshotModule } from '../screenshot';
import { minardUiBaseUrlInjectSymbol } from '../server/types';
import { Event, isEventType } from '../shared/events';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import TokenGenerator from '../shared/token-generator';
import { charlesKnexInjectSymbol } from '../shared/types';
import { FlowdockNotify } from './flowdock-notify';
import { GitHubNotify } from './github-notify';
import { HipchatNotify } from './hipchat-notify';
import { SlackNotify } from './slack-notify';
import {
  FlowdockNotificationConfiguration,
  GitHubNotificationConfiguration,
  HipChatNotificationConfiguration,
  NotificationConfiguration,
  NotificationType,
  SlackNotificationConfiguration,
} from './types';

// type for events that trigger notifications
type NotificationEvent = DeploymentEvent | MinardActivity;
interface NotificationResult {
  type: NotificationType;
  result: boolean;
}
interface NotificationResults {
  event: Event<NotificationEvent>;
  results: NotificationResult[];
}

function getComment(event: NotificationEvent) {
  if (isCommentActivity(event)) {
    return {
      name: event.name,
      email: event.email,
      message: event.message,
      id: event.commentId,
    };
  }
  return undefined;
}

@injectable()
export class NotificationModule {
  public readonly handledEvents: Observable<NotificationResults>;
  public static injectSymbol = Symbol('notification-module');

  constructor(
    @inject(eventBusInjectSymbol) private readonly eventBus: EventBus,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(charlesKnexInjectSymbol) private readonly knex: Knex,
    @inject(minardUiBaseUrlInjectSymbol) private readonly uiBaseUrl: string,
    @inject(FlowdockNotify.injectSymbol)
    public readonly flowdockNotify: FlowdockNotify,
    @inject(ScreenshotModule.injectSymbol)
    private readonly screenshotModule: ScreenshotModule,
    @inject(HipchatNotify.injectSymbol)
    private readonly hipchatNotify: HipchatNotify,
    @inject(SlackNotify.injectSymbol) private readonly slackNotify: SlackNotify,
    @inject(GitHubNotify.injectSymbol)
    public readonly githubNotify: GitHubNotify,
    @inject(TokenGenerator.injectSymbol)
    private readonly tokenGenerator: TokenGenerator,
  ) {
    this.handledEvents = this.subscribe();
  }

  private subscribe() {
    const handledEvents = this.eventBus
      .getStream()
      .flatMap(event => this.handleEvent(event))
      .do(r => this.logResults(r))
      .publish();

    handledEvents.connect();
    return handledEvents;
  }

  private logResults(r: NotificationResults) {
    if (!r || !r.results) {
      return;
    }
    const num = r.results.reduce((sum, x) => sum + (x.result ? 1 : 0), 0);
    if (num) {
      this.logger.debug(
        'Notifications: %s',
        r.results.map(x => `${x.type} = ${x.result}`).join(', '),
      );
    }
  }

  public async deleteConfiguration(id: number): Promise<void> {
    try {
      await this.knex
        .delete()
        .from('notification_configuration')
        .where('id', id);
    } catch (error) {
      this.logger.error('Failed to delete notification configuration', error);
      throw badImplementation();
    }
  }

  public async addConfiguration(
    config: NotificationConfiguration,
  ): Promise<number> {
    try {
      const ids = await this.knex('notification_configuration')
        .insert(config)
        .returning('id');
      return ids[0];
    } catch (error) {
      this.logger.error('Failed to add notification configuration', error);
      throw badImplementation();
    }
  }

  public async getConfiguration(
    id: number,
  ): Promise<NotificationConfiguration | undefined> {
    try {
      const select = this.knex
        .select('*')
        .from('notification_configuration')
        .where('id', id)
        .limit(1)
        .first();
      const ret = (await select) as NotificationConfiguration | undefined;
      return ret
        ? omitBy<NotificationConfiguration, NotificationConfiguration>(
            ret,
            isNil,
          )
        : undefined;
    } catch (error) {
      this.logger.error('Failed to get notification configuration', error);
      throw badImplementation();
    }
  }

  public async getTeamConfigurations(
    teamId: number,
  ): Promise<NotificationConfiguration[]> {
    if (!teamId) {
      throw badRequest('teamId must be defined');
    }
    try {
      const select = this.knex
        .select('*')
        .from('notification_configuration')
        .where('teamId', teamId);
      const ret = (await select) as NotificationConfiguration[] | undefined;
      return ret ? ret.map(c => omitBy(c, isNil)) : [];
    } catch (error) {
      this.logger.error('Failed to fetch notification configurations', error);
      throw badImplementation();
    }
  }

  public async getProjectConfigurations(
    projectId: number,
  ): Promise<NotificationConfiguration[]> {
    if (!projectId) {
      throw badRequest('projectId must be defined');
    }
    try {
      const select = this.knex
        .select('*')
        .from('notification_configuration')
        .where('projectId', projectId);
      const ret = (await select) as NotificationConfiguration[] | undefined;
      return ret ? ret.map(c => omitBy(c, isNil)) : [];
    } catch (error) {
      this.logger.error('Failed to fetch notification configurations', error);
      throw badImplementation();
    }
  }

  public async notify(
    event: Event<NotificationEvent>,
    config: NotificationConfiguration,
  ): Promise<boolean> {
    try {
      if (config.type === 'flowdock') {
        return this.notifyFlowdock(event, config);
      } else if (config.type === 'hipchat') {
        return this.notifyHipchat(event, config);
      } else if (config.type === 'slack') {
        return this.notifySlack(event, config);
      } else if (config.type === 'github') {
        return this.notifyGitHub(event, config);
      }
    } catch (error) {
      this.logger.error(`Failed to send ${config.type} notification`, error);
    }
    return false;
  }

  public async getScreenshotDataUri(event: Event<NotificationEvent>) {
    const { projectId, id, screenshot } = event.payload.deployment;
    return screenshot
      ? this.screenshotModule.getDataUrl(projectId, id)
      : undefined;
  }

  public async getScreenshotData(event: Event<NotificationEvent>) {
    const { projectId, id, screenshot } = event.payload.deployment;
    return screenshot
      ? this.screenshotModule.getScreenshotData(projectId, id)
      : undefined;
  }

  public getBasicParams(event: Event<NotificationEvent>) {
    const { projectId, ref, id } = event.payload.deployment;
    const token = this.tokenGenerator.deploymentToken(projectId, id);
    const projectUrl = getUiProjectUrl(projectId, this.uiBaseUrl);
    const branchUrl = getUiBranchUrl(projectId, ref, this.uiBaseUrl);
    const previewUrl = getUiDeploymentPreviewUrl(
      projectId,
      id,
      token,
      this.uiBaseUrl,
    );
    const comment = getComment(event.payload);
    const commentUrl =
      comment &&
      getUiCommentUrl(projectId, id, token, comment.id, this.uiBaseUrl);
    const deployment = event.payload.deployment;
    return {
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
      deployment,
    };
  }

  public async notifyHipchat(
    event: Event<NotificationEvent>,
    config: HipChatNotificationConfiguration,
  ) {
    const {
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
      deployment,
    } = this.getBasicParams(event);
    // do not send notification for failed deployments
    if (deployment.status !== 'success') {
      return false;
    }
    await this.hipchatNotify.notify(
      deployment,
      config.hipchatRoomId,
      config.hipchatAuthToken,
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
    );
    return true;
  }

  public async notifyFlowdock(
    event: Event<NotificationEvent>,
    config: FlowdockNotificationConfiguration,
  ) {
    const {
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
    } = this.getBasicParams(event);
    const deployment: MinardDeployment = {
      ...event.payload.deployment,
      screenshot: await this.getScreenshotData(event),
    };
    await this.flowdockNotify.notify(
      deployment,
      config.flowToken,
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
    );
    return true;
  }

  public async notifySlack(
    event: Event<NotificationEvent>,
    config: SlackNotificationConfiguration,
  ) {
    const {
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
      deployment,
    } = this.getBasicParams(event);
    // TODO: Slack does not support sending image data in the payload.
    // Figure out a way of getting a public URL for screenshots.
    // screenshot: await this.getScreenshotData(event),
    // do not send notification for failed deployments
    if (deployment.status !== 'success') {
      return false;
    }

    await this.slackNotify.notify(
      deployment,
      config.slackWebhookUrl,
      projectUrl,
      branchUrl,
      previewUrl,
      commentUrl,
      comment,
    );
    return true;
  }

  public async notifyGitHub(
    event: Event<NotificationEvent>,
    config: GitHubNotificationConfiguration,
  ) {
    if (!isEventType<DeploymentEvent>(event, DEPLOYMENT_EVENT_TYPE)) {
      return false;
    }
    const { statusUpdate } = event.payload;
    if (statusUpdate.status !== 'success') {
      return false;
    }
    const { previewUrl } = this.getBasicParams(event);
    await this.githubNotify.notify(previewUrl, event, config);
    return true;
  }

  private async getConfigurations(projectId: number, teamId: number) {
    let configs = await this.getProjectConfigurations(projectId);
    if (configs.length === 0) {
      configs = await this.getTeamConfigurations(teamId);
    }
    return configs;
  }

  private async handleEvent(
    event: Event<NotificationEvent>,
  ): Promise<NotificationResults> {
    if (
      (isEventType<DeploymentEvent>(event, DEPLOYMENT_EVENT_TYPE) &&
        event.payload.statusUpdate.status !== undefined) ||
      (isEventType<MinardActivity>(event, NEW_ACTIVITY) &&
        isCommentActivity(event.payload))
    ) {
      const { teamId, projectId } = event.payload.deployment;
      try {
        const configs = await this.getConfigurations(projectId, teamId);
        const results = await Promise.all(
          configs.map(config =>
            this.notify(event, config).then(r => ({
              type: config.type,
              result: r,
            })),
          ),
        );
        return {
          event,
          results,
        };
      } catch (error) {
        this.logger.error(`Failed to send notifications`, error);
      }
    }
    return {
      event,
      results: [],
    };
  }
}
