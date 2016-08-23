
import 'reflect-metadata';

import Logger from '../shared/logger';
import { expect } from 'chai';

import { createDeploymentEvent } from '../deployment';
import LocalEventBus from '../event-bus/local-event-bus';

import {
  SCREENSHOT_EVENT_TYPE,
  ScreenshotEvent,
  ScreenshotModule,
  Screenshotter,
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

    it('should not take screenshot on other deployment events', () => {
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

    it('should continue after error taking a screenshot', () => {
      // Arrange
      const failProjectId = 5;
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, {} as any, '', '');
      let called = false;
      screenshotModule.takeScreenshot = async function(_projectId, _deploymentId) {
        if (_projectId === failProjectId) {
          throw Error('foo');
        }
        expect(_projectId).to.equal(projectId);
        expect(_deploymentId).to.equal(_deploymentId);
        called = true;
      };
      // Act
      bus.post(createDeploymentEvent({
        id: deploymentId,
        projectId: 5,
        status: 'extracted',
      }));
      bus.post(createDeploymentEvent({
        id: deploymentId,
        projectId: 4,
        status: 'extracted',
      }));

      // Assert
      expect(called).to.equal(true);
    });

  });

  describe('takeScreenshot', () => {
    const baseUrl = 'http://foobar.com';
    it('should call webshot with correct arguments', async () => {
      // Arrange
      let url = null as string | null;
      let path = null as string | null;
      const webshot = {
        webshot: (_url: string, _path: string, options?: any) => {
          url = _url;
          path = _path;
          return Promise.resolve(true);
        },
      } as Screenshotter;

      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, webshot, '', baseUrl);

      // Act
      const publicUrl = await screenshotModule.takeScreenshot(projectId, deploymentId);

      // Assert
      expect(url).to.exist;
      expect(path).to.exist;
      expect(url).to.equal(`http://deploy-4-12.${host}:${port}`);
      expect(publicUrl).to.equal(`${baseUrl}/screenshot/${projectId}/${deploymentId}`);
    });
    it('should post event', async () => {
      // Arrange
      const webshot = {
        webshot: (_url: string, _path: string, options?: any) => {
          return Promise.resolve(true);
        },
      } as Screenshotter;
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(bus, logger, host, port, webshot, '', baseUrl);

      // Act
      screenshotModule.takeScreenshot(projectId, deploymentId);
      const payload = await bus.filterEvents<ScreenshotEvent>(SCREENSHOT_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();

      // Assert
      expect(payload).to.exist;
      expect(payload.projectId).to.equal(projectId);
      expect(payload.deploymentId).to.equal(deploymentId);
      expect(payload.url).to.equal(`${baseUrl}/screenshot/${projectId}/${deploymentId}`);
    });
  });

  describe('deploymentHasScreenshot', () => {

    it('should return true when screenshot exists', async () => {
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(
        bus, {} as any, '', 0, {} as any, 'src/screenshot/test-data', '');
      const has = await screenshotModule.deploymentHasScreenshot(2, 3);
      expect(has).to.equal(true);
    });

    it('should return false when screenshot does not exist', async () => {
      const bus = new LocalEventBus();
      const screenshotModule = new ScreenshotModule(
        bus, {} as any, '', 0, {} as any, 'src/screenshot/test-data', '');
      const has = await screenshotModule.deploymentHasScreenshot(2, 4);
      expect(has).to.equal(false);
    });

  });

});
