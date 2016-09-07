
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
