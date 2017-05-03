
import 'reflect-metadata';

import { expect } from 'chai';
import Logger from '../shared/logger';
import TokenGenerator from '../shared/token-generator';

import {
  ScreenshotModule,
  Screenshotter,
} from './';

const logger = Logger(undefined, true);

describe('screenshot-module', () => {

  const screenshotUrlPattern = 'http://%s.localhost:8000';
  const projectId = 4;
  const deploymentId = 12;

  describe('takeScreenshot', () => {
    const baseUrl = 'http://foobar.com';
    it('should call webshot with correct arguments', async () => {
      // Arrange
      let url = null as string | null;
      let path = null as string | null;
      const webshot = {
        save: (_url: string, _path: string, _options?: any) => {
          url = _url;
          path = _path;
          return Promise.resolve(true);
        },
      } as Screenshotter;
      const generator = new TokenGenerator('secret');
      const screenshotModule = new ScreenshotModule(logger, screenshotUrlPattern, webshot, '', baseUrl, generator);

      // Act
      const publicUrl = await screenshotModule.takeScreenshot(projectId, deploymentId, 'foo');

      // Assert
      expect(url).to.exist;
      expect(path).to.exist;
      expect(url).to.equal(`http://foo-4-12.localhost:8000`);
      expect(publicUrl).to.equal(`${baseUrl}/screenshot/${projectId}/${deploymentId}` +
        `?token=${generator.deploymentToken(projectId, deploymentId)}`);
    });
  });

  describe('deploymentHasScreenshot', () => {
    it('should return true when screenshot exists', async () => {
      const screenshotModule = new ScreenshotModule(
        {} as any, '', {} as any, 'src/screenshot/test-data', '', {} as any);
      const has = await screenshotModule.deploymentHasScreenshot(2, 3);
      expect(has).to.equal(true);
    });

    it('should return false when screenshot does not exist', async () => {
      const screenshotModule = new ScreenshotModule
        ({} as any, '', {} as any, 'src/screenshot/test-data', '', {} as any);
      const has = await screenshotModule.deploymentHasScreenshot(2, 4);
      expect(has).to.equal(false);
    });
  });

});
