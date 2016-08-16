
import 'reflect-metadata';

import Logger from '../shared/logger';
import { expect } from 'chai';

import { createDeploymentEvent } from '../deployment';
import LocalEventBus from '../event-bus/local-event-bus';
import { ScreenshotModule } from './';

const logger = Logger(undefined, true);

describe('screenshot-module', () => {

  const host = 'localhost';
  const port = 80;
  const projectId = 4;
  const deploymentId = 12;

  describe('subscribeToEvents', () => {
    it('should take screenshot when receiving deployment event with status "extracted"', () => {
      // Arrange
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, {} as any);
      let called = false;
      screenshotModule.takeScreenshot = async function(_projectId, _deploymentId) {
        expect(_projectId).to.equal(projectId);
        expect(_deploymentId).to.equal(_deploymentId);
        called = true;
      };
      // Act
      bus.post(createDeploymentEvent({
        id: deploymentId,
        projectId: 4,
        status: 'extracted',
      }));
      // Assert
      expect(called).to.equal(true);
    });

    it('should not take screenshot other deployment events', () => {
      // Arrange
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, {} as any);
      let called = false;
      screenshotModule.takeScreenshot = async function(_projectId, _deploymentId) {
        expect.fail('Should not take screenshot');
      };
      // Act
      bus.post(createDeploymentEvent({
        id: deploymentId,
        projectId: 4,
        status: 'success',
      }));
    });
  });

  describe('takeScreenshot', () => {
    it('should call webshot with correct arguments', async () => {
      let url = null as string | null;
      let path = null as string | null;
      const webshot = async (_url: string, _path: string) => {
        url = _url;
        path = _path;
      };
      const screenshotModule = new ScreenshotModule({} as any, logger, host, port, webshot);
      await screenshotModule.takeScreenshot(projectId, deploymentId);

      expect(url).to.exist;
      expect(path).to.exist;
      expect(url).to.equal('deploy-4-12.localhost:8000');
      expect(path).to.equal(screenshotModule.getScreenshotPath(projectId, deploymentId));
    });
  });

});
