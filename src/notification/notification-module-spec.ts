
import { expect } from 'chai';
import * as Knex from 'knex';
import 'reflect-metadata';

import {
  MinardDeployment,
  createDeploymentEvent,
} from '../deployment';

import {
  LocalEventBus,
} from '../event-bus';

import Logger from '../shared/logger';

import {
  FlowdockNotify,
} from './flowdock-notify';

import {
  getUiBranchUrl,
  getUiProjectUrl,
} from '../project';

import {
  ScreenshotModule,
} from '../screenshot';

import { sleep } from '../shared/sleep';

import { NotificationModule } from './notification-module';

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
  const projectId = 6;
  const deploymentId = 77;
  const screenshotDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';

  async function arrange(flowdockNotify: FlowdockNotify, bus: LocalEventBus) {
    const knex = await setupKnex();

    const screenshotModule = {} as ScreenshotModule;
    screenshotModule.getDataUrl = async(_projectId: number, _deploymentId: number) => {
      expect(_projectId).to.equal(projectId);
      expect(_deploymentId).to.equal(deploymentId);
      return screenshotDataUri;
    };

    const notificationModule = new NotificationModule(
      bus, basicLogger, knex, uiBaseUrl, flowdockNotify, screenshotModule);
    await notificationModule.addConfiguration({
      type: 'flowdock',
      projectId,
      flowToken: 'foo-flow-token',
    });
    return notificationModule;
  }

  it('should trigger flowdock notification for DeploymentEvents', async () => {
    // Arrange
    const bus = new LocalEventBus();
    const flowdockNotify = {} as FlowdockNotify;
    const promise = new Promise<any>((resolve: any, reject: any) => {
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
    await arrange(flowdockNotify, bus);

    // Act
    const deployment = { projectId, ref: 'foo', id: deploymentId, screenshot: 'foo' };
    bus.post(createDeploymentEvent({
      deployment: deployment as any,
      statusUpdate: { status: 'success' },
    }));

    // Assert
    const args = await promise;
    expect(args.deployment.projectId).to.equal(deployment.projectId);
    expect(args.deployment.ref).to.equal(deployment.ref);
    expect(args.deployment.id).to.equal(deploymentId);
    expect(args.deployment.screenshot).to.equal(screenshotDataUri);
    expect(args._flowToken).to.equal(flowToken);
    expect(args._projectUrl).to.equal(getUiProjectUrl(projectId, uiBaseUrl));
    expect(args._branchUrl).to.equal(getUiBranchUrl(projectId, deployment.ref, uiBaseUrl));
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
    await arrange(flowdockNotify, bus);

    // Act
    const deployment = { projectId: _projectId, ref: 'foo' };
    bus.post(createDeploymentEvent({
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
    const notificationModule = await arrange({} as any, new LocalEventBus());
    const config = {
      type: 'flowdock' as 'flowdock',
      projectId: _projectId,
      flowToken: 'fake-flow-token',
    };

    // Act
    const id = await notificationModule.addConfiguration(config);
    const existing = await notificationModule.getConfiguration(id);
    const existingForProject = await notificationModule.getProjectConfigurations(_projectId);
    await notificationModule.deleteConfiguration(id);
    const deleted = await notificationModule.getConfiguration(id);
    const deletedForProject = await notificationModule.getProjectConfigurations(_projectId);

    // Assert
    expect(existing).to.deep.equal(Object.assign(config, { id}));
    expect(existingForProject).to.have.length(1);
    expect(existingForProject[0]).to.deep.equal(Object.assign(config, { id}));
    expect(deleted).to.equal(undefined);
    expect(deletedForProject).to.have.length(0);
  });

});
