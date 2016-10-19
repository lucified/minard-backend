
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { LocalEventBus } from '../event-bus';

import {
  MinardCommit,
} from '../shared/minard-commit';

import {
  DeploymentEvent,
  MinardDeployment,
  createDeploymentEvent,
} from '../deployment';

import Logger from '../shared/logger';

import ActivityModule, {
  toDbActivity,
  toMinardActivity,
} from './activity-module';

import {
  MinardActivity,
} from './types';

import * as Knex from 'knex';

function getEventBus() {
  return new LocalEventBus();
}

const logger = Logger(undefined, true);

describe('activity-module', () => {

  async function setupKnex() {
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await knex.migrate.latest({
      directory: 'migrations/activity',
    });
    return knex;
  }

  const activities: MinardActivity[] = [
    {
      activityType: 'deployment',
      branch: 'foo',
      projectId: 14,
      teamId: 4,
      projectName: 'bar',
      deployment: {
        id: 'foo',
        status: 'success',
      } as any,
      commit: {
        id: 'foo',
      } as any,
      timestamp: moment(),
    },
    {
      activityType: 'deployment',
      branch: 'bar',
      projectId: 14,
      teamId: 4,
      projectName: 'bar',
      deployment: {
        id: 'foo',
        status: 'failed',
      } as any,
      commit: {
        id: 'foo',
      } as any,
      timestamp: moment().add(1, 'days'),
    },
    {
      activityType: 'deployment',
      branch: 'foo-bar',
      projectId: 15,
      teamId: 4,
      projectName: 'bar',
      deployment: {
        id: 'foo',
        status: 'success',
      } as any,
      commit: {
        id: 'foo',
      } as any,
      timestamp: moment().add(1, 'minutes'),
    },
    {
      activityType: 'deployment',
      branch: 'foo-foo-bar',
      projectId: 16,
      teamId: 5,
      projectName: 'bar',
      deployment: {
        id: 'foo',
        status: 'success',
      } as any,
      commit: {
        id: 'foo',
      } as any,
      timestamp: moment(),
    },
  ];

  async function arrangeActivityModule() {
    const knex = await setupKnex();
    await Promise.all(activities.map(item => knex('activity').insert(toDbActivity(item))));
    const activityModule = new ActivityModule(
      {} as any,
      {} as any,
      {} as any,
      getEventBus(),
      knex);
    return activityModule;
  }

  describe('toDdbActivity', () => {
    it('should convert', () => {
      const activity = activities[0];
      const dbActivity = toDbActivity(activity);
      const minardActivity = toMinardActivity(dbActivity);
      expect(minardActivity.timestamp.isSame(activity.timestamp));
    });
  });

  describe('getProjectActivity(...)', () => {
    it('should return a single project correcly', async () => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const projectActivity = await activityModule.getProjectActivity(15);

      // Assert
      expect(projectActivity[0].branch).to.equal(activities[2].branch);
      expect(projectActivity[0].timestamp.isSame(activities[2].timestamp)).to.equal(true);
      expect(projectActivity[0].commit).to.deep.equal(activities[2].commit);
      expect(projectActivity[0].deployment).to.deep.equal(activities[2].deployment);
      expect(projectActivity[0].activityType).to.equal(activities[2].activityType);
      expect(projectActivity[0].teamId).to.equal(activities[2].teamId);
      expect(projectActivity[0].projectName).to.equal(activities[2].projectName);
      expect(projectActivity[0].id).to.exist;
    });

    it('should return two projects in correct order', async () => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const projectActivity = await activityModule.getProjectActivity(14);

      // Assert
      expect(projectActivity).to.exist;
      expect(projectActivity).to.have.length(2);
      expect(projectActivity[0].branch).to.equal(activities[1].branch);
      expect(projectActivity[1].branch).to.equal(activities[0].branch);
    });

    it('should consider count correctly', async() => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const projectActivity = await activityModule.getProjectActivity(14, undefined, 1);

      // Assert
      expect(projectActivity).to.exist;
      expect(projectActivity).to.have.length(1);
      expect(projectActivity[0].branch).to.equal(activities[1].branch);
    });

    it('should consider until parameter correctly', async() => {
      // Arrange
      const projectActivity = await arrangeActivityModule();

      // Act
      const teamActivity = await projectActivity.getProjectActivity(14, activities[0].timestamp, 1);

      // Assert
      expect(teamActivity).to.exist;
      expect(teamActivity).to.have.length(1);
      expect(teamActivity[0].branch).to.equal(activities[0].branch);
    });
  });

  describe('getTeamActivity(...)', () => {
    it('should return a single project correcly', async () => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const teamActivity = await activityModule.getTeamActivity(5);

      // Assert
      expect(teamActivity[0].branch).to.equal(activities[3].branch);
    });

    it('should return three projects in correct order', async () => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const teamActivity = await activityModule.getTeamActivity(4);

      // Assert
      expect(teamActivity).to.exist;
      expect(teamActivity).to.have.length(3);
      expect(teamActivity[0].branch).to.equal(activities[1].branch);
      expect(teamActivity[1].branch).to.equal(activities[2].branch);
      expect(teamActivity[2].branch).to.equal(activities[0].branch);
    });

    it('should consider count correctly', async() => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const teamActivity = await activityModule.getTeamActivity(4, undefined, 2);

      // Assert
      expect(teamActivity).to.exist;
      expect(teamActivity).to.have.length(2);
      expect(teamActivity[0].branch).to.equal(activities[1].branch);
      expect(teamActivity[1].branch).to.equal(activities[2].branch);
    });

    it('should consider until parameter correctly', async() => {
      // Arrange
      const activityModule = await arrangeActivityModule();

      // Act
      const teamActivity = await activityModule.getTeamActivity(4, activities[2].timestamp);

      // Assert
      expect(teamActivity).to.exist;
      expect(teamActivity).to.have.length(2);
      expect(teamActivity[0].branch).to.equal(activities[2].branch);
      expect(teamActivity[1].branch).to.equal(activities[0].branch);
    });
  });

  describe('subscribeForFinishedDeployments', () => {

    const teamId = 7;
    const projectId = 5;
    const deploymentId = 6;
    const ref = 'master';

    const deployment: MinardDeployment = {
      projectId,
      deploymentId,
      commit: {
        message: 'foo',
      } as any,
      ref,
      finishedAt: '2016-08-11T07:36:40.222Z',
    } as any;

    async function shouldCreateActivity(status: 'failed' | 'success') {
      // Arrange
      const bus = getEventBus();
      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        {} as any,
        bus,
        {} as any);

      const promise = new Promise((resolve, reject) => {
        activityModule.addActivity = async (_activity: MinardActivity) => {
          try {
            expect(_activity.teamId).to.equal(teamId);
            expect(_activity.projectId).to.equal(projectId);
            expect(_activity.deployment).to.deep.equal(deployment);
            expect(_activity.branch).to.equal(deployment.ref);
            expect(_activity.projectName).to.equal(deployment.projectName);
            expect(_activity.commit).to.deep.equal(deployment.commit);
            expect(_activity.activityType).to.equal('deployment');
          } catch (err) {
            reject(err);
          }
          resolve();
        };
      });

      // Act
      const event = createDeploymentEvent({
        teamId,
        deployment,
        statusUpdate: {
          status,
        },
      });
      bus.post(event);

      // Assert
      await promise;
    }

    it('should create activity for failed deployment', async () => {
     await shouldCreateActivity('failed');
    });

    it('should create activity for succesful deployment', async () => {
      await shouldCreateActivity('success');
    });

    it('should not create activity for running deployment', async () => {
      // Arrange
      const bus = getEventBus();
      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        {} as any,
        bus,
        {} as any);

      let called = false;
      activityModule.addActivity = async (_activity: MinardActivity) => {
        called = true;
      };

      // Act
      const event = createDeploymentEvent({
        teamId: 6,
        deployment,
        statusUpdate: {
          status: 'running',
        },
      });
      bus.post(event);
      expect(called).to.be.false;
    });

  });

  describe('createDeploymentActivity', () => {
    const projectId = 5;
    const deploymentId = 6;
    const projectName = 'foo';
    const branch = 'master';

    it('should return correct activity ', () => {
      // Arrange
      const teamId = 8;
      const timestamp = moment();
      const commit = {
        id: 'foo-commit-id',
        message: 'foo-message',
      } as MinardCommit;
      const deployment = {
        deploymentId,
        ref: branch,
        commit,
        commitHash: commit.id,
        finishedAt: timestamp,
        projectId,
        projectName,
      } as {} as MinardDeployment;

      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        logger,
        new LocalEventBus(),
        {} as any);

      // Act
      const event: DeploymentEvent = {
        teamId,
        deployment,
        statusUpdate: {
          status: 'success',
        },
      };
      const activity = activityModule.createDeploymentActivity(event);

      // Assert
      const expected: MinardActivity = {
        activityType: 'deployment',
        projectId,
        branch,
        projectName,
        teamId,
        timestamp,
        deployment,
        commit,
      };
      expect(activity).to.deep.equal(expected);
    });

  });

});
