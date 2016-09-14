
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { DeploymentModule } from '../deployment';
import { LocalEventBus } from '../event-bus';
import { ProjectModule } from '../project';

import {
  createDeploymentEvent,
} from '../deployment';

import {
  createScreenshotEvent,
} from '../screenshot';

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

  describe('subscribeForFailedDeployments', () => {

    const projectId = 5;
    const deploymentId = 6;
    const url = 'foo';

    it('should create activity for failed deployment', async () => {
      // Arrange
      const bus = getEventBus();

      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        {} as any,
        bus,
        {} as any);

      activityModule.createDeploymentActivity = async (_projectId: number, _deploymentId: number) => {
        return {
          projectId: _projectId,
          deployment: {
            id: _deploymentId,
            url,
          },
        };
      };

      const promise = new Promise((resolve, reject) => {
        activityModule.addActivity = async (_activity: MinardActivity) => {
          try {
            expect(_activity.projectId).to.equal(projectId);
            expect(_activity.deployment.id).to.equal(deploymentId);
            expect(_activity.deployment.url).to.equal(url);
            expect(_activity.deployment.status).to.equal('failed');
          } catch (err) {
            reject(err);
          }
          resolve();
        };
      });

      // Act
      const event = createDeploymentEvent({
        projectId,
        id: deploymentId,
        status: 'failed',
      });
      bus.post(event);

      // Assert
      await promise;
    });

    it('should not create activity for succesfull deployment', async () => {
      // Arrange
      const bus = getEventBus();
      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        {} as any,
        bus,
        {} as any);

      let called: string | null = null;
      activityModule.createDeploymentActivity = async (_projectId: number, _deploymentId: number) => {
       called = 'createDeploymentActivity was called';
      };

      activityModule.addActivity = async (_activity: MinardActivity) => {
       called = 'addActivity was called';
      };

      // Act
      const event = createDeploymentEvent({
        projectId,
        id: deploymentId,
        status: 'success',
      });
      bus.post(event);

      if (called) {
        expect.fail(null, null, called!);
      }
    });

  });

  describe('subscribeForSuccessfulDeployments', () => {
    it('should create activity for screenshot event', async () => {
      // Arrange
      const projectId = 5;
      const deploymentId = 6;
      const screenshot = 'http://foo-bar.com';
      const bus = getEventBus();
      const activityModule = new ActivityModule(
        {} as any,
        {} as any,
        {} as any,
        bus,
        {} as any);

      activityModule.createDeploymentActivity = async (_projectId: number, _deploymentId: number) => {
        return {
          projectId: _projectId,
          deployment: {
            id: _deploymentId,
          },
        };
      };

      const promise = new Promise((resolve, reject) => {
        activityModule.addActivity = async (_activity: MinardActivity) => {
          try {
            expect(_activity.projectId).to.equal(projectId);
            expect(_activity.deployment.id).to.equal(deploymentId);
            expect(_activity.deployment.screenshot).to.equal(screenshot);
            expect(_activity.deployment.status).to.equal('success');
          } catch (err) {
            reject(err);
          }
          resolve();
        };
      });

      // Act
      const event = createScreenshotEvent({
        projectId,
        deploymentId,
        url: screenshot,
      });
      bus.post(event);

      // Assert
      await promise;
    });

  });

  describe('createDeploymentActivity', () => {
    const projectId = 5;
    const deploymentId = 6;
    const projectName = 'foo';
    const branchName = 'master';
    const finishedAt = '2016-08-11T07:36:40.222Z';
    const commitRef = {
      'id': '6104942438c14ec7bd21c6cd5bd995272b3faff6',
      'author_name': 'randx',
      'author_email': 'dmitriy.zaporozhets@gmail.com',
    };

    it('should return correct activity when fetching related data succeeds', async () => {
      const projectModule = {} as ProjectModule;
      projectModule.toMinardCommit = ProjectModule.prototype.toMinardCommit;
      projectModule.getProject = async (_projectId: number) => {
        return {
          id: _projectId,
          name: projectName,
        };
      };
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getDeployment = async (_projectId: number, _deploymentId: number) => {
        return {
          id: _deploymentId,
          ref: branchName,
          finished_at: finishedAt,
          commitRef,
        };
      };

      const activityModule = new ActivityModule(
        projectModule,
        deploymentModule,
        {} as any,
        getEventBus(),
        {} as any);

      const activity = await activityModule.createDeploymentActivity(projectId, deploymentId);
      expect(activity.activityType).to.equal('deployment');
      expect(activity.projectId).to.equal(projectId);
      expect(activity.projectName).to.equal(projectName);
      expect(activity.branch).to.equal(branchName);
      expect(activity.teamId).to.equal(1);
      expect(activity.deployment.id).to.equal(deploymentId);
      expect(activity.timestamp.isSame(moment(finishedAt))).to.equal(true);
      expect(activity.commit.author.name).to.equal(commitRef.author_name);
    });

  });

});
