
import 'reflect-metadata';

import Logger from '../shared/logger';
import { expect } from 'chai';

import { LocalEventBus } from '../event-bus';
import { ProjectModule } from '../project';
import { ScreenshotModule } from '../screenshot';
import { OperationsModule } from './';

const logger = Logger(undefined, true);

describe('operations-module', () => {

  describe('assureScreenshotsGenerated', () => {
    const _projectId = 5;
    const _deploymentId = 10;

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
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number) {
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          callback();
          return [_projectId];
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [_projectId];
        }
      }
      const eventBus = new LocalEventBus();
      return new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        {} as any,
        eventBus, logger, {} as any);
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
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number) {
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          called = true;
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [failProjectId, _projectId];
        }
      }

      const eventBus = new LocalEventBus();
      const operationsModule = new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        {} as any,
        eventBus, logger, {} as any);

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
          }];
        }
        public async takeScreenshot(projectId: number, deploymentId: number) {
          if (projectId === failProjectId) {
            throw Error('failed to take screenshot');
          }
          expect(projectId).to.equal(_projectId);
          expect(deploymentId).to.equal(_deploymentId);
          called = true;
        }
      }
      class MockProjectModule {
        public async getAllProjectIds() {
          return [_projectId, failProjectId];
        }
      }
      const eventBus = new LocalEventBus();
      const operationsModule = new OperationsModule(
        new MockProjectModule() as ProjectModule,
        new MockDeploymentModule() as any,
        {} as ScreenshotModule,
        eventBus, logger, {} as any);

      // Act
      await operationsModule.assureScreenshotsGenerated();

      // Assert
      expect(called).to.equal(true);
    });

  });

});
