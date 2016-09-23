
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { sprintf } from 'sprintf-js';

import { externalBaseUrlInjectSymbol } from '../server/types';
import * as logger from '../shared/logger';

import {
  Screenshotter,
  screenshotFolderInjectSymbol,
  screenshotUrlPattern,
  screenshotterInjectSymbol,
} from './types';

const urljoin = require('url-join');
const dataURI = require('datauri').promise;

import { promisify } from '../shared/promisify';

@injectable()
export default class ScreenshotModule {

  public static injectSymbol = Symbol('screenshot-module');
  private readonly logger: logger.Logger;
  private readonly urlPattern: string;
  private readonly screenshotter: Screenshotter;
  private readonly folder: string;
  private readonly externalBaseUrl: string;

  constructor(
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(screenshotUrlPattern) urlPattern: string,
    @inject(screenshotterInjectSymbol) screenshotter: Screenshotter,
    @inject(screenshotFolderInjectSymbol) folder: string,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
    this.logger = logger;
    this.urlPattern = urlPattern;
    this.screenshotter = screenshotter;
    this.folder = folder;
    this.externalBaseUrl = baseUrl;
  }

  private getScreenshotDir(projectId: number, deploymentId: number) {
    return path.join(this.folder, String(projectId), String(deploymentId));
  }

  public getPublicUrl(projectId: number, deploymentId: number): string {
    return urljoin(this.externalBaseUrl, 'screenshot', String(projectId), String(deploymentId));
  }

  public async getDataUrl(projectId: number, deploymentId: number) {
    const path = this.getScreenshotPath(projectId, deploymentId);
    return dataURI(path);
  }

  public async getScreenshotData(projectId: number, deploymentId: number) {
    const path = this.getScreenshotPath(projectId, deploymentId);
    return promisify(fs.readFile)(path);
  }

  public getScreenshotPath(projectId: number, deploymentId: number) {
    return path.join(this.getScreenshotDir(projectId, deploymentId), 'screenshot.jpg');
  }

  public async deploymentHasScreenshot(projectId: number, deploymentId: number) {
    return await new Promise(resolve => {
      fs.exists(this.getScreenshotPath(projectId, deploymentId), resolve);
    });
  }

  private getScreenshotterPath(projectId: number, deploymentId: number) {
    return path.join('/screenshots', String(projectId), String(deploymentId), 'screenshot.jpg');
  }

  /*
   * Take a screenshot for given projectId and deploymentId
   */
  public async takeScreenshot(projectId: number, deploymentId: number) {
    const url = sprintf(this.urlPattern, `${projectId}-${deploymentId}`);
    try {
      const file = this.getScreenshotterPath(projectId, deploymentId);
      const webshotOptions = {
        defaultWhiteBackground: true,
        renderDelay: 2000,
      };
      await this.screenshotter.webshot(url, file, webshotOptions);
      return this.getPublicUrl(projectId, deploymentId);
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw Boom.badImplementation();
    }
  }

}
