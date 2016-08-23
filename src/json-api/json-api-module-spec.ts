
import 'reflect-metadata';

import { expect } from 'chai';

import {
  MinardDeployment,
} from '../deployment';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  ProjectModule,
} from '../project/';

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
    it('should work when no deployments are passed');
    it('should work when deployments are are passed');
  });

  describe('toApiBranch', () => {
    it('should work when deployments and commits are passed');
    it('should work when no deployments or commits are passed');
  });

  describe('toApiActivity', () => {
    it('should work with activity of type deployment');
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

      // Avoid instantiating full projectModule
      // as we only need one method
      const projectModule = {} as ProjectModule;
      projectModule.toMinardCommit = ProjectModule.prototype.toMinardCommit;

      const jsonApiModule = new JsonApiModule(
        {} as any,
        projectModule,
        {} as any,
        screenshotModule);

      jsonApiModule.toApiCommit = async (
        _projectId: number,
        commit: MinardCommit,
        deployments?: ApiDeployment[]) => {
        expect(deployments).to.not.exist;
        expect(commit.id).to.equal(minardDeployment.commitRef.id);
        return {
          id: 'foo-commit',
        };
      };
      const deployment = await jsonApiModule.toApiDeployment(projectId, minardDeployment);
      expect(deployment).to.exist;
      expect(deployment.commit.id).to.equal('foo-commit');
      expect(deployment.id).to.equal('5-2');
    });

    it('should work when commit is passed', async () => {
      // Arrange
      const projectId = 5;
      const minardDeployment = {
        id: 2,
        commitRef: { id: 'foo' },
        ref: 'master',
        status: 'success',
      } as MinardDeployment;

      const apiCommit = {
        id: 'foo-commit',
      } as ApiCommit;

      const jsonApiModule = new JsonApiModule({} as any, {} as any, {} as any, screenshotModule);
      const deployment = await jsonApiModule.toApiDeployment(projectId, minardDeployment, apiCommit);
      expect(deployment).to.exist;
      expect(deployment.commit.id).to.equal('foo-commit');
      expect(deployment.id).to.equal('5-2');
    });
  });

  describe('toApiProject()', () => {
    it('should work when no branches are passed', async () => {
      // Arrange
      // -------
      const minardProject = {
        id: 1,
        branches: [
          {
            name: 'master',
          } as MinardBranch,
        ],
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
      // ---
      const project = await api.toApiProject(minardProject);

      // Assert
      // ------
      expect(project.id).to.equal('1');
      expect(project.branches[0].id).to.equal('1-master');
      expect(project.branches[0].deployments).to.have.length(2);
    });

    it('should work when branches is passed', async () => {
      // Arrange
      // -------
      const minardProject = {
        id: 1,
        branches: [
          {
            name: 'master',
          } as MinardBranch,
        ],
      } as MinardProject;
      const branch = {
        id: '1-master',
        deployments: [{}, {}],
      } as ApiBranch;

      const api = {} as JsonApiModule;
      api.toApiProject = JsonApiModule.prototype.toApiProject.bind(api);

      // Act
      // ---
      const project = await api.toApiProject(minardProject, [branch]);

      // Assert
      // ------
      expect(project.id).to.equal(String(minardProject.id));
      expect(project.branches[0].id).to.equal(branch.id);
      expect(project.branches[0].deployments).to.have.length(2);
    });
  });

});
