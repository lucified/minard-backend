
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

import { NotificationModule } from './notification-module';

const silentLogger = Logger(undefined, true);
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

  async function arrange(flowdockNotify: FlowdockNotify, bus: LocalEventBus) {
    const knex = await setupKnex();
    const notificationModule = new NotificationModule(
      bus, basicLogger, knex, uiBaseUrl, flowdockNotify);
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
    const deployment = { projectId, ref: 'foo' };
    bus.post(createDeploymentEvent({
      deployment: deployment as any,
      statusUpdate: {},
    }));

    // Assert
    const args = await promise;
    expect(args.deployment).to.equal(deployment);
    expect(args._flowToken).to.equal(flowToken);
    expect(args._projectUrl).to.equal(getUiProjectUrl(projectId, uiBaseUrl));
    expect(args._branchUrl).to.equal(getUiBranchUrl(projectId, deployment.ref, uiBaseUrl));
  });

  it(`should not trigger notification when no configurations exists for deploymentEvent's projectId`, async () => {
    // Arrange
    const bus = new LocalEventBus();
    const flowdockNotify = {} as FlowdockNotify;
    flowdockNotify.notify = async (
        deployment: MinardDeployment, _flowToken: string, _projectUrl: string, _branchUrl: string) => {
        expect.fail('should not be called');
    };
    await arrange(flowdockNotify, bus);

    // Act
    const deployment = { projectId, ref: 'foo' };
    bus.post(createDeploymentEvent({
      deployment: deployment as any,
      statusUpdate: {},
    }));
  });

});
