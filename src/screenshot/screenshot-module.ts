
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as webshot from 'webshot';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import * as logger from '../shared/logger';

import { externalBaseUrlInjectSymbol } from '../server/types';

import {
  screenshotFolderInjectSymbol,
  screenshotHostInjectSymbol,
  screenshotPortInjectSymbol,
  webshotInjectSymbol,
} from './types';

const promisify = require('bluebird').promisify;
const urljoin = require('url-join');
const mkpath = require('mkpath');

declare type Webshot = typeof webshot;

import {
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
} from '../deployment';

@injectable()
export default class ScreenshotModule {

  public static injectSymbol = Symbol('screenshot-module');
  private readonly logger: logger.Logger;
  private readonly eventBus: EventBus;
  private readonly screenshotHost: string;
  private readonly screenshotPort: number;
  private readonly webshot: Webshot;
  private readonly folder: string;
  private readonly externalBaseUrl: string;

  constructor(
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(screenshotHostInjectSymbol) host: string,
    @inject(screenshotPortInjectSymbol) port: number,
    @inject(webshotInjectSymbol) webshot: Webshot,
    @inject(screenshotFolderInjectSymbol) folder: string,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.screenshotHost = host;
    this.screenshotPort = port;
    this.webshot = webshot;
    this.folder = folder;
    this.externalBaseUrl = baseUrl;
    this.subscribeToEvents();
  }

  public subscribeToEvents() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.status === 'extracted')
      .subscribe(event => {
        const projectId = event.payload.projectId;
        const deploymentId = event.payload.id;
        if (!projectId) {
          this.logger.warn(
            `Deployment event for deployment ${deploymentId} was missing projectId. Skipped creation of screenshot.`);
          return;
        }
        this.takeScreenshot(projectId, event.payload.id);
      });
  }

  private getScreenshotDir(projectId: number, deploymentId: number) {
    return path.join(this.folder, String(projectId), String(deploymentId));
  }

  public async getPublicUrl(projectId: number, deploymentId: number): Promise<string | null> {
    if (!this.deploymentHasScreenshot(projectId, deploymentId)) {
      return null;
    }
    return urljoin(this.externalBaseUrl, 'screenshot', String(projectId), String(deploymentId));
  }

  public getScreenshotPath(projectId: number, deploymentId: number) {
    const file = path.join(this.getScreenshotDir(projectId, deploymentId), 'screenshot.jpg');
    return file;
  }

  public async deploymentHasScreenshot(projectId: number, deploymentId: number) {
    return await (promisify(fs.exists) as any)
      (this.getScreenshotPath(projectId, deploymentId)) as boolean;
  }

  /*
   * Take a screenshot for given projectId and deploymentId
   */
  public async takeScreenshot(projectId: number, deploymentId: number) {
    const url = `http://deploy-${projectId}-${deploymentId}.${this.screenshotHost}:${this.screenshotPort}`;
    try {
      const dir = this.getScreenshotDir(projectId, deploymentId);
      const file = this.getScreenshotPath(projectId, deploymentId);
      const webshotOptions = {
        defaultWhiteBackground: true,
        renderDelay: 2000,
      };
      await (promisify(mkpath) as any)(dir);
      await promisify(this.webshot)(url, file, webshotOptions);
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw Boom.badImplementation();
    }
  }

}
