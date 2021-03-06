import { badImplementation } from 'boom';
import { exists, readFile as _readFile } from 'fs';
import { inject, injectable } from 'inversify';
import { join } from 'path';
import { sprintf } from 'sprintf-js';
import { promisify } from 'util';

import { externalBaseUrlInjectSymbol } from '../server/types';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import TokenGenerator from '../shared/token-generator';

const readFile = promisify<string, string, { encoding: string; flag?: string }>(
  _readFile,
);

import {
  PageresOptions,
  screenshotFolderInjectSymbol,
  Screenshotter,
  screenshotterInjectSymbol,
  screenshotUrlPattern,
} from './types';

const urljoin = require('url-join');
const dataURI = require('datauri').promise;

@injectable()
export default class ScreenshotModule {
  public static injectSymbol = Symbol('screenshot-module');

  constructor(
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(screenshotUrlPattern) private readonly urlPattern: string,
    @inject(screenshotterInjectSymbol)
    private readonly screenshotter: Screenshotter,
    @inject(screenshotFolderInjectSymbol) private readonly folder: string,
    @inject(externalBaseUrlInjectSymbol)
    private readonly externalBaseUrl: string,
    @inject(TokenGenerator.injectSymbol)
    private readonly tokenGenerator: TokenGenerator,
  ) {}

  private getScreenshotDir(projectId: number, deploymentId: number) {
    return join(this.folder, String(projectId), String(deploymentId));
  }

  public getPublicUrl(projectId: number, deploymentId: number): string {
    return (
      urljoin(
        this.externalBaseUrl,
        'screenshot',
        String(projectId),
        String(deploymentId),
      ) +
      `?token=${this.tokenGenerator.deploymentToken(projectId, deploymentId)}`
    );
  }

  public isValidToken(projectId: number, deploymentId: number, token: string) {
    return (
      this.tokenGenerator.deploymentToken(projectId, deploymentId) === token
    );
  }

  public async getDataUrl(projectId: number, deploymentId: number) {
    const path = this.getScreenshotPath(projectId, deploymentId);
    return dataURI(path);
  }

  public getScreenshotData(projectId: number, deploymentId: number) {
    const path = this.getScreenshotPath(projectId, deploymentId);
    return readFile(path, { encoding: 'base64' });
  }

  public getScreenshotPath(projectId: number, deploymentId: number) {
    return join(
      this.getScreenshotDir(projectId, deploymentId),
      this.getScreenshotFilename(projectId, deploymentId),
    );
  }

  public getScreenshotFilename(_projectId: number, _deploymentId: number) {
    return 'screenshot.jpg';
  }

  public async deploymentHasScreenshot(
    projectId: number,
    deploymentId: number,
  ) {
    return await new Promise<boolean>(resolve =>
      exists(this.getScreenshotPath(projectId, deploymentId), resolve),
    );
  }

  private getRemoteDest(projectId: number, deploymentId: number) {
    // TODO: the remote path shouldn't be hardcoded here
    return join('/screenshots', String(projectId), String(deploymentId));
  }

  /*
   * Take a screenshot for given projectId and deploymentId
   */
  public async takeScreenshot(
    projectId: number,
    deploymentId: number,
    shortId: string,
  ) {
    const url = sprintf(
      this.urlPattern,
      `${shortId}-${projectId}-${deploymentId}`,
    );
    const dest = this.getRemoteDest(projectId, deploymentId);
    const options: PageresOptions = {
      filename: stripExtension(
        this.getScreenshotFilename(projectId, deploymentId),
      ),
      delay: 10,
      format: 'jpg',
    };
    try {
      await this.screenshotter.save(url, dest, options);
      return this.getPublicUrl(projectId, deploymentId);
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw badImplementation();
    }
  }
}

export function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}
