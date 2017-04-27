
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { sprintf } from 'sprintf-js';

import { externalBaseUrlInjectSymbol } from '../server/types';
import * as logger from '../shared/logger';

import TokenGenerator from '../shared/token-generator';

import {
  PageresOptions,
  screenshotFolderInjectSymbol,
  Screenshotter,
  screenshotterInjectSymbol,
  screenshotUrlPattern,
} from './types';

const urljoin = require('url-join');
const dataURI = require('datauri').promise;

import { promisify } from '../shared/promisify';

@injectable()
export default class ScreenshotModule {

  public static injectSymbol = Symbol('screenshot-module');

  constructor(
    @inject(logger.loggerInjectSymbol) private readonly logger: logger.Logger,
    @inject(screenshotUrlPattern) private readonly urlPattern: string,
    @inject(screenshotterInjectSymbol) private readonly screenshotter: Screenshotter,
    @inject(screenshotFolderInjectSymbol) private readonly folder: string,
    @inject(externalBaseUrlInjectSymbol) private readonly externalBaseUrl: string,
    @inject(TokenGenerator.injectSymbol) private readonly tokenGenerator: TokenGenerator,
  ) {

  }

  private getScreenshotDir(projectId: number, deploymentId: number) {
    return path.join(this.folder, String(projectId), String(deploymentId));
  }

  public getPublicUrl(projectId: number, deploymentId: number): string {
    return urljoin(this.externalBaseUrl, 'screenshot', String(projectId), String(deploymentId))
      + `?token=${this.tokenGenerator.deploymentToken(projectId, deploymentId)}`;
  }

  public isValidToken(projectId: number, deploymentId: number, token: string) {
    return this.tokenGenerator.deploymentToken(projectId, deploymentId) === token;
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
    return path.join(
      this.getScreenshotDir(projectId, deploymentId),
      this.getScreenshotFilename(projectId, deploymentId),
    );
  }

  public getScreenshotFilename(_projectId: number, _deploymentId: number) {
    return 'screenshot.jpg';
  }

  public async deploymentHasScreenshot(projectId: number, deploymentId: number) {
    return await new Promise<boolean>(resolve => fs.exists(this.getScreenshotPath(projectId, deploymentId), resolve));
  }

  private getRemoteDest(projectId: number, deploymentId: number) {
    // TODO: the remote path shouldn't be hardcoded here
    return path.join('/screenshots', String(projectId), String(deploymentId));
  }

  /*
   * Take a screenshot for given projectId and deploymentId
   */
  public async takeScreenshot(projectId: number, deploymentId: number, shortId: string) {
    const url = sprintf(this.urlPattern, `${shortId}-${projectId}-${deploymentId}`);
    const dest = this.getRemoteDest(projectId, deploymentId);
    const options: PageresOptions = {
      filename: this.getScreenshotFilename(projectId, deploymentId).replace(/\.[^.]+$/, ''),
      delay: 5,
      format: 'jpg',
    };
    try {
      await this.screenshotter.save(url, dest, options);
      return this.getPublicUrl(projectId, deploymentId);
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw Boom.badImplementation();
    }
  }

}
