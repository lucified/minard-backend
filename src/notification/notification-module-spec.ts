import { expect } from 'chai';
import * as Knex from 'knex';
import 'reflect-metadata';

import { createDeploymentEvent, MinardDeployment } from '../deployment';
import { LocalEventBus } from '../event-bus';
import { getUiBranchUrl, getUiProjectUrl } from '../project';
import { ScreenshotModule } from '../screenshot';
import Logger from '../shared/logger';
import { sleep } from '../shared/sleep';
import { FlowdockNotify } from './flowdock-notify';
import { HipchatNotify } from './hipchat-notify';
import { NotificationModule } from './notification-module';
import { SlackNotify } from './slack-notify';

const basicLogger = Logger(undefined, false);

describe('notification-module', () => {

  async function setupKnex() {
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await knex.migrate.latest({
      directory: 'migrations/notification',
    });
    return knex;
  }

  const uiBaseUrl = 'http://foo-bar.com';
  const flowToken = 'foo-flow-token';
  const teamId = 66;
  const projectId = 6;
  const deploymentId = 77;
  const screenshotData = 'iVBORw0KGgoAAAANSUhEUgAA';

  async function arrange(
    flowdockNotify: FlowdockNotify,
    bus: LocalEventBus,
    hipchatNotify: HipchatNotify,
    slackNotify: SlackNotify,
  ) {
    const knex = await setupKnex();

    const screenshotModule = {} as ScreenshotModule;
    screenshotModule.getScreenshotData = async(_projectId: number, _deploymentId: number) => {
      return screenshotData;
    };

    const notificationModule = new NotificationModule(
      bus,
      basicLogger,
      knex,
      uiBaseUrl,
      flowdockNotify,
      screenshotModule,
      hipchatNotify,
      slackNotify,
    );
    await notificationModule.addConfiguration({
      type: 'flowdock',
      projectId,
      teamId: null,
      flowToken: 'foo-flow-token',
    });
    await notificationModule.addConfiguration({
      type: 'flowdock',
      projectId: null,
      teamId,
      flowToken: 'foo-flow-token',
    });
    return notificationModule;
  }

  async function shouldTriggerFlowdockNotification(_teamId: number, _projectId: number) {
    // Arrange
    const bus = new LocalEventBus();
    const flowdockNotify = {} as FlowdockNotify;
    const promise = new Promise<any>((resolve: any, _reject: any) => {
      flowdockNotify.notify = async (
        deployment: MinardDeployment, _flowToken: string, _projectUrl: string, _branchUrl: string) => {
        resolve({
          deployment,
          _projectUrl,
          _branchUrl,
          _flowToken,
        });
      };
    });
    await arrange(flowdockNotify, bus, {} as any, {} as any);

    // Act
    const deployment = { projectId: _projectId, ref: 'foo', id: deploymentId, screenshot: 'foo', teamId: _teamId };
    bus.post(createDeploymentEvent({
      teamId: _teamId,
      deployment: deployment as any,
      statusUpdate: { status: 'success' },
    }));

    // Assert
    const args = await promise;
    expect(args.deployment.projectId).to.equal(deployment.projectId);
    expect(args.deployment.ref).to.equal(deployment.ref);
    expect(args.deployment.id).to.equal(deploymentId);
    expect(args.deployment.screenshot).to.equal(screenshotData);
    expect(args._flowToken).to.equal(flowToken);
    return args;
  }

  it('should trigger flowdock notification for DeploymentEvents with matching projectId', async () => {
    const args = await shouldTriggerFlowdockNotification(teamId + 1, projectId);
    expect(args._projectUrl).to.equal(getUiProjectUrl(projectId, uiBaseUrl));
    expect(args._branchUrl).to.equal(getUiBranchUrl(projectId, 'foo', uiBaseUrl));
  });

  it('should trigger flowdock notification for DeploymentEvents with matching teamId', async () => {
    const args = await shouldTriggerFlowdockNotification(teamId, projectId + 1);
    expect(args._projectUrl).to.equal(getUiProjectUrl(projectId + 1, uiBaseUrl));
    expect(args._branchUrl).to.equal(getUiBranchUrl(projectId + 1, 'foo', uiBaseUrl));
  });

  it('should trigger HipChat notifications for DeploymentEvents', async () => {
    // Arrange
    const hipchatProjectId = 77;
    const bus = new LocalEventBus();
    const hipchatNotify = {} as HipchatNotify;
    const promise = new Promise<any>((resolve: any, _reject: any) => {
      hipchatNotify.notify = async (
        deployment: MinardDeployment,
        roomId: number,
        authToken: string,
        _projectUrl: string,
        _branchUrl: string,
      ) => {
        resolve({
          deployment,
          roomId,
          authToken,
          _projectUrl,
          _branchUrl,
        });
      };
    });

    const config = {
      type: 'hipchat' as 'hipchat',
      projectId: hipchatProjectId,
      teamId: null,
      hipchatRoomId: 7,
      hipchatAuthToken: 'foo-auth-token',
    };

    const notificationModule = await arrange({} as any, bus, hipchatNotify, {} as any);
    await notificationModule.addConfiguration(config);

    // Act
    const deployment = { projectId: hipchatProjectId, ref: 'foo', id: deploymentId, screenshot: 'foo', teamId: 7 };
    bus.post(createDeploymentEvent({
      teamId: 7,
      deployment: deployment as any,
      statusUpdate: { status: 'success' },
    }));

    // Assert
    const args = await promise;
    expect(args.deployment.projectId).to.equal(deployment.projectId);
    expect(args.deployment.ref).to.equal(deployment.ref);
    expect(args.deployment.id).to.equal(deploymentId);
    expect(args.deployment.screenshot).to.equal(deployment.screenshot);
    expect(args.authToken).to.equal(config.hipchatAuthToken);
    expect(args.roomId).to.equal(config.hipchatRoomId);
    expect(args._projectUrl).to.equal(getUiProjectUrl(hipchatProjectId, uiBaseUrl));
    expect(args._branchUrl).to.equal(getUiBranchUrl(hipchatProjectId, deployment.ref, uiBaseUrl));
  });

  it('should trigger Slack notifications for DeploymentEvents', async () => {
    // Arrange
    const mockUrl = 'http://fake.slack.webhook/url';
    const slackProjectId = 12356732;
    const bus = new LocalEventBus();
    const slackNotify = {} as SlackNotify;
    const promise = new Promise<any>((resolve: any, _reject: any) => {
      slackNotify.notify = async (
        deployment: MinardDeployment,
        webhookUrl: string,
        projectUrl: string,
        branchUrl: string,
      ) => {
        resolve({
          deployment,
          webhookUrl,
          projectUrl,
          branchUrl,
        });
      };
    });

    const config = {
      type: 'slack' as 'slack',
      projectId: slackProjectId,
      teamId: null,
      slackWebhookUrl: mockUrl,
    };

    const notificationModule = await arrange({} as any, bus, {} as any, slackNotify);
    const configurationResult = await notificationModule.addConfiguration(config);

    // Act
    const deployment = { projectId: slackProjectId, ref: 'foo', id: deploymentId, screenshot: 'foo', teamId: 7 };
    bus.post(createDeploymentEvent({
      teamId: 7,
      deployment: deployment as any,
      statusUpdate: { status: 'success' },
    }));

    // Assert
    const result = await promise;
    expect(configurationResult).to.be.a('number');
    expect(result.deployment.projectId).to.equal(deployment.projectId);
    expect(result.deployment.ref).to.equal(deployment.ref);
    expect(result.deployment.id).to.equal(deploymentId);
    expect(result.projectUrl).to.equal(getUiProjectUrl(slackProjectId, uiBaseUrl));
    expect(result.branchUrl).to.equal(getUiBranchUrl(slackProjectId, deployment.ref, uiBaseUrl));
    expect(result.webhookUrl).to.equal(mockUrl);
  });

  async function shouldNotTriggerNotification(_projectId: number, statusUpdate: any) {
    // Arrange
    const bus = new LocalEventBus();
    const flowdockNotify = {} as FlowdockNotify;
    let called = false;
    flowdockNotify.notify = async (
      deployment: MinardDeployment, _flowToken: string, _projectUrl: string, _branchUrl: string) => {
      console.log(`Error: Should not be called. Was called with projectId ${deployment.projectId}`);
      called = true;
    };
    await arrange(flowdockNotify, bus, {} as any, {} as any);

    // Act
    const deployment = { projectId: _projectId, ref: 'foo', teamId: 9 };
    bus.post(createDeploymentEvent({
      teamId: 7,
      deployment: deployment as any,
      statusUpdate,
    }));
    await sleep(20);
    expect(called).to.be.false;
  }

  it(`should not trigger notification when no configurations exists for deploymentEvent's projectId`, async () => {
    await shouldNotTriggerNotification(9, { status: 'success' });
  });

  it(`should not trigger notification when main status does not update`, async () => {
    await shouldNotTriggerNotification(projectId, { screenshotStatus: 'running' });
  });

  it('should be able to add, get and delete configurations', async () => {
    const _projectId = 9;
    // Arrange
    const notificationModule = await arrange({} as any, new LocalEventBus(), {} as any, {} as any);
    const config = {
      type: 'slack' as 'slack',
      projectId: _projectId,
      flowToken: null,
      hipchatAuthToken: null,
      hipchatRoomId: null,
      slackWebhookUrl: 'http://mock.slack.url/sdadsad',
      teamId: null,
    };

    // Act
    const id = await notificationModule.addConfiguration(config);
    const existing = await notificationModule.getConfiguration(id);
    const existingForProject = await notificationModule.getProjectConfigurations(_projectId);
    await notificationModule.deleteConfiguration(id);
    const deleted = await notificationModule.getConfiguration(id);
    const deletedForProject = await notificationModule.getProjectConfigurations(_projectId);

    // Assert
    expect(existing).to.deep.equal({ ...config, id });
    expect(existing!.slackWebhookUrl).to.equal(config.slackWebhookUrl);
    expect(existingForProject).to.have.length(1);
    expect(existingForProject[0]).to.deep.equal({ ...config, id });
    expect(existingForProject[0].slackWebhookUrl).to.equal(config.slackWebhookUrl);
    expect(deleted).to.equal(undefined);
    expect(deletedForProject).to.have.length(0);
  });

});
