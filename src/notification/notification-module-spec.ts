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
type NC = Partial<NotificationConfiguration>;

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
  flowdock: Partial<FlowdockNotificationConfiguration>;
  hipchat: Partial<HipChatNotificationConfiguration>;
  slack: Partial<SlackNotificationConfiguration>;
  github: Partial<GitHubNotificationConfiguration>;
}

const configurations: Configurations = {
  flowdock: {
    type: 'flowdock',
    projectId,
    flowToken: 'foo-flow-token',
  },
  hipchat: {
    type: 'hipchat',
    projectId,
    hipchatRoomId: 7,
    hipchatAuthToken: 'foo-auth-token',
  },
  slack: {
    type: 'slack',
    projectId,
    slackWebhookUrl: 'http://fake.slack.webhook/url',
  },
  github: {
    type: 'github',
    projectId,
    githubInstallationId: 1234,
    githubAppId: 5678,
    githubAppPrivateKey: 'baz',
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
  let arrangements: {
    bus: LocalEventBus;
    instance: NotificationModule;
    flowdock: SinonStub;
    github: SinonStub;
    slack: SinonStub;
    hipchat: SinonStub;
  };
  beforeEach(async () => {
    arrangements = await arrange();
  });
  afterEach(async () => {
    arrangements = await arrange();
  });
  describe('getConfigurations', () => {
    it('test knex', () => {
      const { instance } = arrangements;
      const latestIds = instance.knex.max('id AS id')
        .from('notification_configuration')
        .whereNotNull('projectId')
        .andWhere('teamId', 1)
        .groupBy('type')
        .as('p1');
      const select = instance.knex
        .select('p.*')
        .from('notification_configuration AS p')
        .join(latestIds, 'p1.id', 'p.id');
      console.log(select.toString());
    });
    it(`should return only the latest project scoped configuration per type`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration(configurations.flowdock);
      await instance.addConfiguration({
        ...configurations.flowdock,
        flowToken: configurations.flowdock.flowToken + '1',
      });
      const found = await instance.getConfigurations(projectId);
      expect(found.length).to.eq(1);
      expect(found[0].type).to.eq('flowdock');
      expect((found[0] as any).flowToken).to.eq(
        configurations.flowdock.flowToken + '1',
      );
    });
    it(`should be able to fetch project scoped configurations given only a projectId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration(configurations.flowdock);
      await instance.addConfiguration(configurations.hipchat);
      const found = await instance.getConfigurations(projectId);
      expect(found.length).to.eq(2);
      expect(found[0].type).to.eq('flowdock');
      expect(found[1].type).to.eq('hipchat');
    });
    it(`should not find project scoped configurations given only a teamId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration(configurations.flowdock);
      await instance.addConfiguration(configurations.hipchat);
      const found = await instance.getConfigurations(undefined, teamId);
      expect(found.length).to.eq(0);
    });
    it(`should be able to fetch project scoped configurations given a projectId and a teamId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration(configurations.flowdock);
      await instance.addConfiguration(configurations.hipchat);
      const found = await instance.getConfigurations(projectId, teamId);
      expect(found.length).to.eq(2);
      expect(found[0].type).to.eq('flowdock');
      expect(found[1].type).to.eq('hipchat');
    });
    it(`should return only the latest team scoped configuration per type`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration({
        ...configurations.flowdock,
        projectId: null,
        teamId,
      });
      await instance.addConfiguration({
        ...configurations.flowdock,
        flowToken: configurations.flowdock.flowToken + '1',
        projectId: null,
        teamId,
      });
      const found = await instance.getConfigurations(undefined, teamId);
      expect(found.length).to.eq(1);
      expect(found[0].type).to.eq('flowdock');
      expect((found[0] as any).flowToken).to.eq(
        configurations.flowdock.flowToken + '1',
      );
    });
    it(`should be able to fetch team scoped configurations given only a teamId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration({
        ...configurations.flowdock,
        projectId: null,
        teamId,
      });
      await instance.addConfiguration({
        ...configurations.hipchat,
        projectId: null,
        teamId,
      });
      const found = await instance.getConfigurations(undefined, teamId);
      expect(found.length).to.eq(2);
      expect(found[0].type).to.eq('flowdock');
      expect(found[1].type).to.eq('hipchat');
    });
    it(`should not find team scoped configurations given only a projectId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration({
        ...configurations.flowdock,
        projectId: null,
        teamId,
      });
      await instance.addConfiguration({
        ...configurations.hipchat,
        projectId: null,
        teamId,
      });
      const found = await instance.getConfigurations(projectId);
      expect(found.length).to.eq(0);
    });
    it(`should be able to fetch team scoped configurations given a projectId and a teamId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration({
        ...configurations.flowdock,
        projectId: null,
        teamId,
      });
      await instance.addConfiguration({
        ...configurations.hipchat,
        projectId: null,
        teamId,
      });
      const found = await instance.getConfigurations(projectId, teamId);
      expect(found.length).to.eq(2);
      expect(found[0].type).to.eq('flowdock');
      expect(found[1].type).to.eq('hipchat');
    });
    it(`should be able to fetch mixed scoped configurations given a projectId and a teamId`, async () => {
      // Arrange
      const { instance } = arrangements;
      // Act
      await instance.addConfiguration({
        ...configurations.github,
        projectId: undefined,
        githubOwner: 'foo',
        githubRepo: undefined,
        githubInstallationId: undefined,
        teamId,
      });
      await instance.addConfiguration({
        ...configurations.github,
        teamId: undefined,
        githubAppId: configurations.github.githubAppId! + 1,
        githubAppPrivateKey: undefined,
        projectId,
      });
      const found = await instance.getConfigurations(projectId, teamId);
      expect(found.length).to.eq(1);
      const config = found[0] as GitHubNotificationConfiguration;
      expect(config.type).to.eq('github');
      expect(config.githubOwner).to.eq(configurations.github.githubOwner);
      expect(config.githubAppId).to.eq(configurations.github.githubAppId! + 1);
    });
  });
  describe('per type tests', () => {
    const notificationTypes = Object.keys(
      configurations,
    ) as (keyof Configurations)[];
    for (const notificationType of notificationTypes) {
      it(`should be able to add, get and delete project scoped ${notificationType} configurations`, async () => {
        // Arrange
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
        const { instance } = arrangements;
        const config = omitBy<NC, NC>(
          { ...configurations[notificationType], projectId: null, teamId },
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
        const { instance, bus } = arrangements;
        const config = omitBy<NC, NC>(
          { ...configurations[notificationType], projectId: null, teamId },
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

    for (const notificationType of notificationTypes.filter(
      t => t !== 'flowdock',
    )) {
      it(`should not trigger ${notificationType} notification if deployment has not succeeded`, async () => {
        // Arrange
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
});
