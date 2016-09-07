
import { expect } from 'chai';
import 'reflect-metadata';

import { DeploymentModule, MinardDeployment } from '../deployment';
import { MinardCommit, MinardProject, ProjectModule } from '../project';
import * as logger from  '../shared/logger';
import { ActivityModule, MinardActivity } from './';

describe('activity-module', () => {

  describe('getProjectActivity(...)', () => {

    const minardDeployments = [
      {
        id: 9,
        finished_at: '2015-12-24T19:51:12.802Z',
        ref: 'master',
        commitRef: {
          id: 'foo-commit-id',
        },
        status: 'success',
      } as MinardDeployment,
      {
        id: 10,
        finished_at: '2015-13-24T19:51:12.802Z',
        ref: 'foo-branch',
        commitRef: {
          id: 'bar-commit-id',
        },
        status: 'failed',
      } as MinardDeployment,
      {
        id: 11,
        finished_at: '2015-13-24T19:51:12.802Z',
        ref: 'foo-branch',
        commitRef: {
          id: 'foo-bar-commit-id',
        },
        status: 'running',
      } as MinardDeployment,
    ];

    it('should assemble activity correctly for two deployments', async () => {
      // Arrange
      class MockDeploymentModule {
        public async getProjectDeployments(projectId: number, teamId?: number): Promise<MinardDeployment[]> {
          expect(projectId).to.equal(5);
          return minardDeployments;
        }
      }
      class MockProjectModule {
        public async getProject(projectId: number): Promise<MinardProject> {
          expect(projectId).to.equal(5);
          return {
            id: 5,
            name: 'foo',
          } as MinardProject;
        }
      }
      const projectModule = new MockProjectModule() as ProjectModule;
      projectModule.toMinardCommit = ProjectModule.prototype.toMinardCommit;
      const deploymentModule = new MockDeploymentModule() as DeploymentModule;
      const activityModule = new ActivityModule(
        projectModule,
        deploymentModule,
        {} as logger.Logger);

      // Act
      const activity = await activityModule.getProjectActivity(5) as MinardActivity[];

      // Assert
      expect(activity).to.exist;
      expect(activity).to.have.length(2);

      expect(activity[0].activityType).to.equal('deployment');
      expect(activity[0].project.id).to.equal(5);
      expect(activity[0].branch.name).to.equal('master');
      expect(activity[0].deployment).to.exist;
      expect(activity[0].deployment.id).to.equal(9);
      expect(activity[0].commit).to.exist;
      expect(activity[0].commit.id).to.equal(minardDeployments[0].commitRef.id);
      expect(activity[0].timestamp).to.equal(minardDeployments[0].finished_at);

      expect(activity[1].activityType).to.equal('deployment');
      expect(activity[1].deployment.id).to.equal(10);
      expect(activity[1].branch.name).to.equal('foo-branch');
    });
  });

  describe('getTeamActivity(...)', () => {
    it('should assemble activity correctly for a team with two projects', async () => {
      // Arrange
      class MockProjectModule {
        public async getProjects(teamId: number): Promise<MinardProject[]> {
          expect(teamId).to.equal(1);
          return [
            {
              id: 15,
            } as MinardProject,
            {
              id: 16,
            } as MinardProject,
          ];
        }
      }
      const projectModule = new MockProjectModule() as ProjectModule;
      projectModule.toMinardCommit = () => ({}) as any;

      const activityModule = new ActivityModule(
        projectModule,
        {} as DeploymentModule,
        {} as logger.Logger);
      activityModule.getProjectActivity = async (projectId: number) => {
        if (projectId === 15) {
          return [
            {
              deployment: { id: '15-1' },
              timestamp: '2015-12-24T19:51:11.802Z', // first
            },
            {
              deployment: { id: '15-2' },
              timestamp: '2015-12-24T19:51:14.802Z', // fourth
            },
          ];
        }
        if (projectId === 16) {
          return [
            {
              deployment: { id: '16-1' },
              timestamp: '2015-12-24T19:51:12.802Z', // second
            },
            {
              deployment: { id: '16-2' },
              timestamp: '2015-12-24T19:51:13.802Z', // third
            },
          ];
        }
        expect.fail('called getProjectId with wrong projectId');
        return [];
      };

      // Act
      const activity = await activityModule.getTeamActivity(1) as MinardActivity[];

      // Assert
      expect(activity).to.have.length(4);
      // note that should be in descending (most-recent-first) order
      expect(activity[3].deployment.id).to.equal('15-1');
      expect(activity[2].deployment.id).to.equal('16-1');
      expect(activity[1].deployment.id).to.equal('16-2');
      expect(activity[0].deployment.id).to.equal('15-2');
    });
  });

});
