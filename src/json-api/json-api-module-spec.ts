
import 'reflect-metadata';

import { expect } from 'chai';
import * as moment from 'moment';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment';

import {
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
  ApiDeployment,
  ApiProject,
  JsonApiModule,
} from './';

import { toGitlabTimestamp } from '../shared/time-conversion';

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
        branch: 'foo-branch-name',
        teamId: 1,
        projectId: 6,
        projectName: 'foo-project-name',
        deployment: {
          id: 8,
          status: 'success',
          commitRef: {
            id: 'foo-commit-id',
          },
        } as MinardDeployment,
        commit: {
          id: 'foo-commit-id',
          author: {
            name: 'foo-name',
            email: 'foo-email',
            timestamp: '2022-09-20T09:06:12+03:00',
          },
        } as MinardCommit,
        timestamp: moment(),
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
      expect(activity.branch.id).to.equal(`${minardActivity.projectId}-${minardActivity.branch}`);
      expect(activity.branch.name).to.equal(minardActivity.branch);
      expect(activity.project.id).to.equal(String(minardActivity.projectId));
      expect(activity.project.name).to.equal(minardActivity.projectName);
      expect(activity.timestamp).to.equal(toGitlabTimestamp(minardActivity.timestamp));
      expect(activity.commit.id).to.equal(`${minardActivity.projectId}-${minardActivity.commit.id}`);
      expect(activity.commit.author).to.deep.equal(minardActivity.commit.author);
      expect(activity.deployment.id).to.equal(`${minardActivity.projectId}-${minardActivity.deployment.id}`);
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
    const projectId = 5;
    const branchName = 'master';
    const minardCommits = [
      {
        id: 'foo-commit',
      },
      {
        id: 'bar-commit',
      },
    ];
    const minardDeployments = [
      {
        id: 'foo-deployment',
        commitRef: minardCommits[0],
      },
      {
        id: 'bar-deployment',
        commitRef: minardCommits[1],
      },
      {
        id: 'foo-two-deployment',
        commitRef: minardCommits[0],
      },
    ];

    it('should return commits correctly with two branches having three deployments', async () => {
      // Arrange
      const projectModule = {} as ProjectModule;
      projectModule.getBranchCommits = async (_projectId: number, _branchName: string) => {
        expect(_projectId).to.equal(projectId);
        expect(_branchName).to.equal(branchName);
        return minardCommits;
      };
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getBranchDeployments = async (_projectId: number, _branchName: string) => {
        expect(_projectId).to.equal(projectId);
        expect(_branchName).to.equal(branchName);
        return minardDeployments;
      };
      const jsonApiModule = new JsonApiModule(
        deploymentModule,
        projectModule,
        {} as any,
        {} as any);

      jsonApiModule.toApiDeployment = async(_projectId: number, deployment: MinardDeployment) => {
        return {
          id: `${_projectId}-${deployment.id}-foo`,
          commitHash: deployment.commitRef.id,
        };
      };

      // Act
      const commits = await jsonApiModule.getBranchCommits(projectId, branchName);

      // Assert
      expect(commits).to.exist;
      expect(commits).to.have.length(2);
      expect(commits![0].deployments).to.have.length(2);
      expect(commits![0].id).to.equal(`${projectId}-${minardCommits[0].id}`);
      expect(commits![0].hash).to.equal(minardCommits[0].id);
      expect(commits![0].deployments[0].id).to.equal(`${projectId}-${minardDeployments[0].id}-foo`);
      expect(commits![0].deployments[1].id).to.equal(`${projectId}-${minardDeployments[2].id}-foo`);
      expect(commits![1].deployments).to.have.length(1);
      expect(commits![1].id).to.equal(`${projectId}-${minardCommits[1].id}`);
      expect(commits![1].deployments[0].id).to.equal(`${projectId}-${minardDeployments[1].id}-foo`);
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
      latestActivityTimestamp: 'fake-timestamp',
    };
    const minardDeployment = {
      id: 5,
      commitRef: {
        id: 'bar-commit-id',
      },
    };
    const latestCommitReturnedFromToApiCommit = {
      id: '5-foo-commit-id',
      hash: 'foo-commit-hash',
    };
    const latestDeployedCommitFromToApiCommit = {
      id: '5-bar-commit-id',
      hash: 'bar-commit-hash',
    };

    it ('should return valid ApiBranch when fetching of related data succeeds', async () => {
      // Arrange
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getMinardJsonInfo = async (projectId: number, branchName: string) => {
        return minardJsonInfo;
      };
      deploymentModule.getLatestSuccessfulBranchDeployment = async (projectId: number) => {
        return minardDeployment;
      };
      const projectModule = {} as ProjectModule;
      projectModule.toMinardCommit = ProjectModule.prototype.toMinardCommit;
      const screenshotModule = {} as ScreenshotModule;
      screenshotModule.deploymentHasScreenshot = async (projectId: number, deploymentId: number) => {
        return false;
      };

      const jsonApiModule = new JsonApiModule(
        deploymentModule,
        projectModule,
        {} as any,
        screenshotModule);
      jsonApiModule.toApiCommit = async(projectId: number, commit: MinardCommit, deployments?: ApiDeployment[]) => {
        if (commit.id === minardBranch.latestCommit.id) {
          return latestCommitReturnedFromToApiCommit;
        }
        if (commit.id === minardDeployment.commitRef.id) {
          return latestDeployedCommitFromToApiCommit;
        }
        throw Error('invalid params to toApiCommit');
      };

      // Act
      const branch = await jsonApiModule.toApiBranch(project, minardBranch);

      // Assert
      expect(branch).to.exist;
      expect(branch.id).to.equal(`${project.id}-${minardBranch.name}`);
      expect(branch.minardJson).to.deep.equal(minardJsonInfo);
      expect(branch.latestCommit).to.deep.equal(latestCommitReturnedFromToApiCommit);
      expect(branch.name).to.equal(minardBranch.name);
      expect(branch.project).to.equal(project.id);
      expect(branch.latestActivityTimestamp).to.equal(minardBranch.latestActivityTimestamp);
      expect(branch.latestSuccessfullyDeployedCommit).to.deep.equal(latestDeployedCommitFromToApiCommit);
    });

  });

  describe('toApiProject()', () => {
    it('should work', async () => {
      // Arrange
      const minardProject = {
        id: 1,
        latestActivityTimestamp: 'fake-timestamp',
        repoUrl: 'http://foo-repo/foo/bar.git',
      } as MinardProject;
      const minardDeployment = {
        id: 5,
        commitRef: {
          id: 'foo-commit-id',
        },
      };

      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getLatestSuccessfulProjectDeployment = async (projectId: number) => {
        return minardDeployment;
      };
      const projectModule = {} as ProjectModule;
      projectModule.toMinardCommit = ProjectModule.prototype.toMinardCommit;
      const screenshotModule = {} as ScreenshotModule;
      screenshotModule.deploymentHasScreenshot = async (projectId: number, deploymentId: number) => {
        return false;
      };

      const jsonApiModule = new JsonApiModule(
        deploymentModule,
        projectModule,
        {} as any,
        screenshotModule);

      // Act
      const project = await jsonApiModule.toApiProject(minardProject);

      // Assert
      expect(project.id).to.equal(1);
      expect(project.latestActivityTimestamp).to.equal(minardProject.latestActivityTimestamp);
      expect(project.latestSuccessfullyDeployedCommit).to.exist;
      expect(project.latestSuccessfullyDeployedCommit!.id)
        .to.equal(`${minardProject.id}-${minardDeployment.commitRef.id}`);
      expect(project.latestSuccessfullyDeployedCommit!.deployments).to.have.length(1);
      expect(project.latestSuccessfullyDeployedCommit!.deployments[0].id)
        .to.equal(`${minardProject.id}-${minardDeployment.id}`);
      expect(project.repoUrl).to.equal(minardProject.repoUrl);
    });
  });

});
