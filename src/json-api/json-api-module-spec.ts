
import 'reflect-metadata';

import { expect } from 'chai';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  ProjectModule,
} from '../project/';

import {
  MinardActivity,
} from '../activity';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiProject,
  JsonApiModule,
} from './';


describe('json-api-module', () => {

  describe('toApiCommit', () => {

    const projectId = 5;
    const minardCommit = {
      id: 'foo-commit-id',
      message: 'foo-commit-message',
      author: {
        name: 'foo-name',
        email: 'foo-email',
        timestamp: '',
      },
      committer: {
        name: 'bar-name',
        email: 'bar-email',
        timestamp: '',
      },
    };
    const deployments = [
      {
        id: 'foo-deployment-id',
      },
      {
        id: 'bar-deployment-id',
      },
    ] as {} as ApiDeployment[];

    it('should work when deployments are passed as parameter', async () => {
      const jsonApiModule = new JsonApiModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any);

      // Act
      const commit = await jsonApiModule.toApiCommit(projectId, minardCommit, deployments);

      // Assert
      expect(commit.id).to.equal(`${projectId}-${minardCommit.id}`);
      expect(commit.author).to.deep.equal(minardCommit.author);
      expect(commit.committer).to.deep.equal(minardCommit.committer);
      expect(commit.hash).to.equal(minardCommit.id);
      expect(commit.message).to.equal(minardCommit.message);
      expect(commit.deployments).to.deep.equal(deployments);
    });

    it('should work when deployments are not passed as parameter', async () => {
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getCommitDeployments = async (_projectId: number, sha: string) => {
        expect(projectId).to.equal(projectId);
        expect(sha).to.equal(minardCommit.id);
        return deployments;
      };
      const jsonApiModule = new JsonApiModule(
        deploymentModule,
        {} as any,
        {} as any,
        {} as any);

      jsonApiModule.toApiDeployment = async (_projectId: number, deployment: MinardDeployment) => {
        // rewrite the ids to chech that this was called, with correct parameters
        return {
          id: `${projectId}-${deployment.id}`,
        };
      };

      // Act
      const commit = await jsonApiModule.toApiCommit(projectId, minardCommit);

      // Assert
      expect(commit.id).to.equal(`${projectId}-${minardCommit.id}`);
      expect(commit.author).to.deep.equal(minardCommit.author);
      expect(commit.committer).to.deep.equal(minardCommit.committer);
      expect(commit.hash).to.equal(minardCommit.id);
      expect(commit.message).to.equal(minardCommit.message);
      expect(commit.deployments).have.length(2);
      expect(commit.deployments[0].id).to.equal(`${projectId}-${deployments[0].id}`);
      expect(commit.deployments[1].id).to.equal(`${projectId}-${deployments[1].id}`);
    });
  });

  describe('toApiActivity', () => {
    it('should work with activity of type deployment', async () => {
      // Arrange
      const minardActivity: MinardActivity = {
        activityType: 'deployment',
        branch: {
          id: 'foo-branch-id',
          name: 'foo-branch-name',
        },
        project: {
          id: 6,
          name: 'foo-project-name',
        } as MinardProject,
        deployment: {
          id: 8,
          status: 'success',
        } as MinardDeployment,
        commit: {
          id: 'foo-commit-id',
          author: {
            name: 'foo-name',
            email: 'foo-email',
            timestamp: '2022-09-20T09:06:12+03:00',
          },
        },
        timestamp: '2012-09-20T09:06:12+03:00',
      };
      const jsonApiModule = new JsonApiModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any);

      // Act
      const activity = await jsonApiModule.toApiActivity(minardActivity);

      // Assert
      expect(activity.activityType).to.equal('deployment');
      expect(activity.branch.id).to.equal(`${minardActivity.project.id}-${minardActivity.branch.id}`);
      expect(activity.branch.name).to.equal(minardActivity.branch.name);
      expect(activity.project.id).to.equal(minardActivity.project.id);
      expect(activity.project.name).to.equal(minardActivity.project.name);
      expect(activity.timestamp).to.equal(minardActivity.timestamp);
      expect(activity.commit.id).to.equal(`${minardActivity.project.id}-${minardActivity.commit.id}`);
      expect(activity.commit.author).to.deep.equal(minardActivity.commit.author);
      expect(activity.deployment.id).to.equal(`${minardActivity.project.id}-${minardActivity.deployment.id}`);
      expect(activity.deployment.status).to.equal(minardActivity.deployment.status);
    });
  });

  describe('toApiDeployment', () => {

    const screenshotModule = {} as ScreenshotModule;
    screenshotModule.getPublicUrl = () => {
      return 'http://foobar.com';
    };
    screenshotModule.deploymentHasScreenshot = async () => {
      return true;
    };

    it('should work when commit is not passed', async () => {
      // Arrange
      const projectId = 5;
      const minardDeployment = {
        id: 2,
        commitRef: { id: 'foo' },
        ref: 'master',
        status: 'success',
      } as MinardDeployment;

      const jsonApiModule = new JsonApiModule(
        {} as any,
        {} as any,
        {} as any,
        screenshotModule);
      const deployment = await jsonApiModule.toApiDeployment(projectId, minardDeployment);
      expect(deployment).to.exist;
      expect(deployment.id).to.equal('5-2');
    });
  });


  describe('getBranchCommits', () => {
    it('should work with two deployments having', async () => {
      //
    });
  });

  describe('toApiBranch', () => {

    const minardJsonInfo = { foo: 'bar' };
    const project = { id: 5 } as ApiProject;
    const minardBranch = {
      project: project.id,
      name: 'foo-branch-name',
      latestCommit: {
        id: 'foo-commit-id',
      } as {} as MinardCommit,
    };
    const returnedFromToApiCommit = {
      id: '5-foo-commit-id',
      hash: 'foo-commit-hash',
    };

    it ('should return valid ApiBranch when fetching of related data succeeds', async () => {
      // Arrange
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getMinardJsonInfo = async (projectId: number, branchName: string) => {
        return minardJsonInfo;
      };
      const jsonApiModule = new JsonApiModule(
        deploymentModule,
        {} as any,
        {} as any,
        {} as any);
      jsonApiModule.toApiCommit = async(projectId: number, commit: MinardCommit) => {
        expect(projectId).to.equal(project.id);
        expect(commit).to.deep.equal(minardBranch.latestCommit);
        return returnedFromToApiCommit;
      };

      // Act
      const branch = await jsonApiModule.toApiBranch(project, minardBranch);

      // Assert
      expect(branch).to.exist;
      expect(branch.id).to.equal(`${project.id}-${minardBranch.name}`);
      expect(branch.minardJson).to.deep.equal(minardJsonInfo);
      expect(branch.latestCommit).to.deep.equal(returnedFromToApiCommit);
      expect(branch.name).to.equal(minardBranch.name);
      expect(branch.project).to.equal(project.id);
    });

  });

  describe('toApiProject()', () => {
    it('should work', async () => {
      // Arrange
      const minardProject = {
        id: 1,
      } as MinardProject;

      const api = {} as JsonApiModule;
      api.toApiProject = JsonApiModule.prototype.toApiProject.bind(api);
      api.toApiBranch = async (project: ApiProject, branch: MinardBranch) => {
        expect(project.id).to.equal('1');
        return {
          id: '1-master',
          deployments: [{}, {}],
        };
      };

      // Act
      const project = await api.toApiProject(minardProject);

      // Assert
      expect(project.id).to.equal(1);
    });
  });

});
