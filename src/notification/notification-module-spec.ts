import { expect, use } from 'chai';
import { Container } from 'inversify/dts/inversify';
import * as Knex from 'knex';
import { isNil, omitBy } from 'lodash';
import * as moment from 'moment';
import 'reflect-metadata';
import { SinonStub, stub } from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { createDeploymentEvent, MinardDeployment } from '../deployment';
import { eventBusInjectSymbol, LocalEventBus } from '../event-bus';
import { ScreenshotModule } from '../screenshot/index';
import { minardUiBaseUrlInjectSymbol } from '../server/types';
import { MethodStubber, stubber } from '../shared/test';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  FlowdockNotificationConfiguration,
  FlowdockNotify,
  GitHubNotificationConfiguration,
  GitHubNotify,
  HipChatNotificationConfiguration,
  HipchatNotify,
  NotificationConfiguration,
  NotificationModule,
  SlackNotificationConfiguration,
  SlackNotify,
} from './index';
type NC = NotificationConfiguration;

const screenshotData = 'iVBORw0KGgoAAAANSUhEUgAA';
const uiBaseUrl = 'http://foo-bar.com';
const teamId = 66;
const projectId = 6;
const deploymentId = 77;
const deployment: MinardDeployment = {
  projectId,
  ref: 'foo',
  id: deploymentId,
  screenshot: 'foo',
  teamId,
  status: 'success',
  projectName: 'foo-project-name',
  url: 'http://foo-deployment-url.com',
  commitHash: 'abcdef12345',
  buildStatus: 'success',
  extractionStatus: 'success',
  screenshotStatus: 'failed',
  createdAt: moment(),
  commit: {
    id: 'foo-id',
    shortId: 'foo-id',
    message: 'foo',
    committer: {
      name: 'Ville Saarinen',
      email: 'ville.saarinen@lucify.com',
      timestamp: 'fake-timestamp',
    },
    author: {
      name: 'Ville Saarinen',
      email: 'ville.saarinen@lucify.com',
      timestamp: 'fake-timestamp',
    },
  },
};

const projectDeploymentEvent = createDeploymentEvent({
  teamId,
  deployment,
  statusUpdate: { status: 'success' },
});
const teamDeploymentEvent = createDeploymentEvent({
  teamId,
  deployment: { ...deployment, projectId: projectId + 1 },
  statusUpdate: { status: 'success' },
});
const runningDeploymentEvent = createDeploymentEvent({
  teamId,
  deployment: { ...deployment, status: 'running' },
  statusUpdate: { status: 'running' },
});

interface Configurations {
  flowdock: FlowdockNotificationConfiguration;
  hipchat: HipChatNotificationConfiguration;
  slack: SlackNotificationConfiguration;
  github: GitHubNotificationConfiguration;
}

const configurations: Configurations = {
  flowdock: {
    type: 'flowdock',
    projectId,
    teamId,
    flowToken: 'foo-flow-token',
  },
  hipchat: {
    type: 'hipchat',
    projectId,
    teamId,
    hipchatRoomId: 7,
    hipchatAuthToken: 'foo-auth-token',
  },
  slack: {
    type: 'slack',
    projectId,
    teamId,
    slackWebhookUrl: 'http://fake.slack.webhook/url',
  },
  github: {
    type: 'github',
    projectId,
    teamId,
    githubInstallationId: 1234,
    githubRepo: 'foo',
    githubOwner: 'bar',
  },
};

function arrangeNotifiers(kernel: Container) {
  const flowdock = stubber(
    (n: FlowdockNotify) => stub(n, n.notify.name).returns(Promise.resolve()),
    FlowdockNotify.injectSymbol,
    kernel,
  );
  const hipchat = stubber(
    (n: HipchatNotify) => stub(n, n.notify.name).returns(Promise.resolve()),
    HipchatNotify.injectSymbol,
    kernel,
  );
  const slack = stubber(
    (n: SlackNotify) => stub(n, n.notify.name).returns(Promise.resolve()),
    SlackNotify.injectSymbol,
    kernel,
  );
  const github = stubber(
    (n: GitHubNotify) => stub(n, n.notify.name).returns(Promise.resolve()),
    GitHubNotify.injectSymbol,
    kernel,
  );
  return {
    flowdock: flowdock.stubs[0],
    hipchat: hipchat.stubs[0],
    slack: slack.stubs[0],
    github: github.stubs[0],
  };
}

async function arrangeModule(
  kernel: Container,
  stubbings: MethodStubber<NotificationModule> = (
    _: NotificationModule,
    _k: Container,
  ) => [] as SinonStub[],
) {
  kernel.rebind(NotificationModule.injectSymbol).to(NotificationModule);
  kernel.rebind(minardUiBaseUrlInjectSymbol).toConstantValue(uiBaseUrl);

  const bus = new LocalEventBus();
  kernel.rebind(eventBusInjectSymbol).toConstantValue(bus);
  stubber(
    (s: ScreenshotModule) =>
      stub(s, s.getScreenshotData.name).returns(
        Promise.resolve(screenshotData),
      ),
    ScreenshotModule.injectSymbol,
    kernel,
  );
  const { instance, stubs } = stubber(
    stubbings,
    NotificationModule.injectSymbol,
    kernel,
  );
  return {
    instance,
    stubs,
    bus,
  };
}

async function arrange() {
  const kernel = bootstrap('test');
  await setupKnex(kernel);

  const stubs = arrangeNotifiers(kernel);
  const { bus, instance } = await arrangeModule(kernel);
  return {
    ...stubs,
    bus,
    instance,
  };
}

async function setupKnex(kernel: Container) {
  const knex = kernel.get<Knex>(charlesKnexInjectSymbol);
  await knex.migrate.latest({
    directory: 'migrations/notification',
  });
  return knex;
}

describe('notification-module', () => {
  const notificationTypes = Object.keys(
    configurations,
  ) as (keyof Configurations)[];
  for (const notificationType of notificationTypes) {
    it(`should be able to add, get and delete project scoped ${notificationType} configurations`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance } = arrangements;
      const config = configurations[notificationType];
      // Act
      const id = await instance.addConfiguration(config);
      const existing = await instance.getConfiguration(id);
      const existingForProject = await instance.getProjectConfigurations(
        projectId,
      );
      await instance.deleteConfiguration(id);
      const deleted = await instance.getConfiguration(id);
      const deletedForProject = await instance.getProjectConfigurations(
        projectId,
      );

      // Assert
      expect(existing).to.deep.equal({ ...config, id });
      expect(existingForProject).to.have.length(1);
      expect(existingForProject[0]).to.deep.equal({ ...config, id });
      expect(deleted).to.equal(undefined);
      expect(deletedForProject).to.have.length(0);
    });
    it(`should be able to add, get and delete team scoped ${notificationType} configurations`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance } = arrangements;
      const config = omitBy<NC, NC>(
        { ...configurations[notificationType], projectId: null },
        isNil,
      );
      // Act
      const id = await instance.addConfiguration(config);
      const existing = await instance.getConfiguration(id);
      const existingForTeam = await instance.getTeamConfigurations(teamId);
      await instance.deleteConfiguration(id);
      const deleted = await instance.getConfiguration(id);
      const deletedForTeam = await instance.getTeamConfigurations(teamId);

      // Assert
      expect(existing).to.deep.equal({ ...config, id });
      expect(existingForTeam).to.have.length(1);
      expect(existingForTeam[0]).to.deep.equal({ ...config, id });
      expect(deleted).to.equal(undefined);
      expect(deletedForTeam).to.have.length(0);
    });

    // tslint:disable-next-line:max-line-length
    it(`should trigger ${notificationType} notification with a matching project scoped configuration`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance, bus } = arrangements;
      await instance.addConfiguration(configurations[notificationType]);
      const promise = instance.handledEvents.take(1).toPromise();

      // Act
      bus.post(projectDeploymentEvent);
      await promise;
      // Assert
      const stub = arrangements[notificationType];
      expect(stub).to.have.been.calledOnce;
    });
    it(`should trigger ${notificationType} notification with a matching team scoped configuration`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance, bus } = arrangements;
      const config = omitBy<NC, NC>(
        { ...configurations[notificationType], projectId: null },
        isNil,
      );
      await instance.addConfiguration(config);
      const promise = instance.handledEvents.take(1).toPromise();

      // Act
      bus.post(teamDeploymentEvent);
      await promise;

      // Assert
      const stub = arrangements[notificationType];
      expect(stub).to.have.been.calledOnce;
    });
    // tslint:disable-next-line:max-line-length
    it(`should not trigger ${notificationType} notification when no matching configurations exist`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance, bus } = arrangements;
      await instance.addConfiguration({
        ...configurations[notificationType],
        projectId: projectId + 1,
        teamId: teamId + 1,
      });
      const promise = instance.handledEvents.take(1).toPromise();

      // Act
      bus.post(projectDeploymentEvent);
      const response = await promise;

      // Assert
      const stub = arrangements[notificationType];
      expect(stub).to.not.have.been.called;
      expect(response.results.length).to.eq(0);
    });
  }

  for (const notificationType of notificationTypes.filter(t => t !== 'flowdock')) {
    it(`should not trigger ${notificationType} notification if deployment has not succeeded`, async () => {
      // Arrange
      const arrangements = await arrange();
      const { instance, bus } = arrangements;
      await instance.addConfiguration(configurations[notificationType]);
      const promise = instance.handledEvents.take(1).toPromise();

      // Act
      bus.post(runningDeploymentEvent);
      const response = await promise;

      // Assert
      const stub = arrangements[notificationType];
      expect(stub).to.not.have.been.called;
      expect(response.results.length).to.eq(1);
      expect(response.results[0].type).to.eq(notificationType);
      expect(response.results[0].result).to.be.false;
    });
  }

});
