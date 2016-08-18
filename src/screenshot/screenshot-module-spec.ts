
import 'reflect-metadata';

import Logger from '../shared/logger';
import { expect } from 'chai';

import { createDeploymentEvent } from '../deployment';
import LocalEventBus from '../event-bus/local-event-bus';

import {
  SCREENSHOT_EVENT_TYPE,
  ScreenshotEvent,
  ScreenshotModule,
} from './';

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
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, {} as any, '', '');
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
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, {} as any, '', '');
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
      // Arrange
      let url = null as string | null;
      let path = null as string | null;
      const webshot = (_url: string, _path: string, options: any, callback: () => void) => {
        url = _url;
        path = _path;
        callback();
      };
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, webshot, '', '');

      // Act
      await screenshotModule.takeScreenshot(projectId, deploymentId);

      // Assert
      expect(url).to.exist;
      expect(path).to.exist;
      expect(url).to.equal(`http://deploy-4-12.${host}:${port}`);
      expect(path).to.equal(screenshotModule.getScreenshotPath(projectId, deploymentId));
    });
    it('should post event', async (done) => {
      const baseUrl = 'http://foobar.com';
      // Arrange
      const webshot = (_url: string, _path: string, options: any, callback: () => void) => {
        callback();
      };
      const bus = new LocalEventBus();
      bus.filterEvents<ScreenshotEvent>(SCREENSHOT_EVENT_TYPE).subscribe(event => {
        expect(event.payload.projectId).to.equal(projectId);
        expect(event.payload.deploymentId).to.equal(deploymentId);
        expect(event.payload.url).to.equal(`${baseUrl}/screenshot/${projectId}/${deploymentId}`);
        done();
      });
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, webshot, '', baseUrl);
      screenshotModule.takeScreenshot(projectId, deploymentId);
    });
  });

});
