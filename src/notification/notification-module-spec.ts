
import { expect } from 'chai';
import * as Knex from 'knex';
import 'reflect-metadata';

import {
  DEPLOYMENT_EVENT_TYPE,
  createDeploymentEvent,
  MinardDeployment,
} from '../deployment';

import {
  Event,
  LocalEventBus,
} from '../event-bus';

import Logger from '../shared/logger';

import {
  FlowdockNotify,
} from './flowdock-notify';

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

  it('should trigger flowdock notification for DeploymentEvents', async () => {
    // Arrange
    const bus = new LocalEventBus();
    const knex = await setupKnex();
    const flowdockNotify = {} as FlowdockNotify;
    const notificationModule = new NotificationModule(
      bus, basicLogger, knex, uiBaseUrl, flowdockNotify);
    await notificationModule.addConfiguration({
      type: 'flowdock',
      projectId,
      options: {
        flowToken: 'foo-flow-token',
      },
    });

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

    // Act
    const deployment = { projectId };
    bus.post(createDeploymentEvent({
      deployment: {
        projectId,
      } as MinardDeployment,
      statusUpdate: {},
    }));

    // Assert
    const args = await promise;
    expect(args.deployment).to.equal(deployment);
    expect(args._flowToken).to.equal(flowToken);
    expect(args._projectUrl).to.equal();
    expect(args._branchUrl).to.equal();
  });

});
