import { expect } from 'chai';
import 'reflect-metadata';

import {
  DeploymentModule,
  DeploymentStatusUpdate,
  MinardDeploymentStatus,
} from '../deployment';
import { ProjectModule } from '../project';
import Logger from '../shared/logger';
import { OperationsModule } from './';

const logger = Logger(undefined, true);

describe('operations-module', () => {

  describe('assureScreenshotsGenerated', () => {
    const _projectId = 5;
    const _deploymentId = 10;
    const _shortId = 7;

    function arrangeOperationsModule(
      buildStatus: string,
      extractionStatus: string,
      screenshotStatus: string,
      callback: () => void) {
      class MockDeploymentModule {
        public async getProjectDeployments(projectId: number) {
          expect(projectId).to.equal(_projectId);
          return [{
            id: _deploymentId,
            buildStatus,
            screenshotStatus,
            extractionStatus,
            commit: {
              shortId: _shortId,
            },
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number, shortId: number) {
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          expect(shortId).to.equal(_shortId);
          callback();
          return [_projectId];
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [_projectId];
        }
      }
      return new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        logger,
        {} as any,
        {} as any,
      );
    }

    it('should create missing screenshot for extracted deployment', async () => {
      let called = false;
      const operationsModule = arrangeOperationsModule(
          'success', 'success', 'failed', () => called = true );
      await operationsModule.assureScreenshotsGenerated();
      expect(called).to.equal(true);
    });

    it('should not create screenshot for deployment with success build thas has not been extracted', async () => {
      let called = false;
      const operationsModule = arrangeOperationsModule(
          'success', 'failed', 'failed', () => called = true );
      await operationsModule.assureScreenshotsGenerated();
      expect(called).to.equal(false);
    });

    it('should not create screenshot deployment that already has one', async () => {
      let called = false;
      const operationsModule = arrangeOperationsModule(
          'success', 'success', 'success', () => called = true );
      await operationsModule.assureScreenshotsGenerated();
      expect(called).to.equal(false);
    });

    it('should gracefully handle error fetching project deployments', async () => {
      const failProjectId = 6;
      let called = false;
      class MockDeploymentModule {
        public async getProjectDeployments(projectId: number) {
          if (projectId === failProjectId) {
            throw Error('');
          }
          expect(projectId).to.equal(_projectId);
          return [{
            id: _deploymentId,
            status: 'success',
            extractionStatus: 'success',
            screenshotStatus: 'failed',
            commit: {
              shortId: _shortId,
            },
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number, shortId: string) {
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          expect(shortId).to.equal(_shortId);
          called = true;
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [failProjectId, _projectId];
        }
      }

      const operationsModule = new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        logger,
        {} as any,
        {} as any,
      );

      // Act
      await operationsModule.assureScreenshotsGenerated();

      // Assert
      expect(called).to.equal(true);
    });

    it('should gracefully handle error taking screenshots', async () => {
      const failProjectId = 6;
      let called = false;
      class MockDeploymentModule {
        public async getProjectDeployments(projectId: number) {
          expect(projectId).to.equal(_projectId);
          return [{
            id: _deploymentId,
            status: 'success',
            extractionStatus: 'success',
            screenshotStatus: 'failed',
            commit: {
              shortId: _shortId,
            },
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number, shortId: string) {
          if (projectId === failProjectId) {
            throw Error('failed to take screenshot');
          }
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          expect(shortId).to.equal(_shortId);
          called = true;
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [_projectId, failProjectId];
        }
      }
      const operationsModule = new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        logger,
        {} as any,
        {} as any,
      );

      // Act
      await operationsModule.assureScreenshotsGenerated();

      // Assert
      expect(called).to.equal(true);
    });
  });

  describe('cleanupRunningDeployments', () => {
    const deploymentId = 5;
    it('should work when deployment is stuck at at screenshots phase', async () => {
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getDeploymentsByStatus = async (_status: MinardDeploymentStatus) => {
        return [
          {
            id: 5,
            buildStatus: 'success',
            extractionStatus: 'success',
            screenshotStatus: 'running',
          },
        ] as any;
      };

      // Arrange
      const promise = new Promise((resolve, _reject) => {
        deploymentModule.updateDeploymentStatus = async (id: number, update: DeploymentStatusUpdate) => {
          resolve({ id, update });
        };
      });
      const operationsModule = new OperationsModule(
        {} as any,
        deploymentModule,
        logger,
        {} as any,
        {} as any,
      );

      // Act
      operationsModule.cleanupRunningDeployments();
      const params = await promise as { id: number, update: DeploymentStatusUpdate };

      // Assert
      expect(params.id).to.equal(deploymentId);
      expect(params.update).to.deep.equal({ screenshotStatus: 'failed' });
    });
  });

});
