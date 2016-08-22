
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { externalBaseUrlInjectSymbol } from '../server/types';
import * as logger from '../shared/logger';
import { createScreenshotEvent } from './types';

import {
  Screenshotter,
  screenshotFolderInjectSymbol,
  screenshotHostInjectSymbol,
  screenshotPortInjectSymbol,
  screenshotterInjectSymbol,
} from './types';

const urljoin = require('url-join');

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
  private readonly screenshotter: Screenshotter;
  private readonly folder: string;
  private readonly externalBaseUrl: string;

  constructor(
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(screenshotHostInjectSymbol) host: string,
    @inject(screenshotPortInjectSymbol) port: number,
    @inject(screenshotterInjectSymbol) screenshotter: Screenshotter,
    @inject(screenshotFolderInjectSymbol) folder: string,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.screenshotHost = host;
    this.screenshotPort = port;
    this.screenshotter = screenshotter;
    this.folder = folder;
    this.externalBaseUrl = baseUrl;
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.status === 'extracted' && event.payload.projectId !== undefined)
      .flatMap(async event => {
        try {
          return await this.takeScreenshot(event.payload.projectId!, event.payload.id);
        } catch (err) {
          return null;
        }
      })
      .subscribe();
  }

  private getScreenshotDir(projectId: number, deploymentId: number) {
    return path.join(this.folder, String(projectId), String(deploymentId));
  }

  public getPublicUrl(projectId: number, deploymentId: number): string {
    return urljoin(this.externalBaseUrl, 'screenshot', String(projectId), String(deploymentId));
  }

  public getScreenshotPath(projectId: number, deploymentId: number) {
    return path.join(this.getScreenshotDir(projectId, deploymentId), 'screenshot.jpg');
  }

  public async deploymentHasScreenshot(projectId: number, deploymentId: number) {
    return await new Promise(resolve => {
      fs.exists(this.getScreenshotPath(projectId, deploymentId), resolve);
    });
  }

  /*
   * Take a screenshot for given projectId and deploymentId
   */
  public async takeScreenshot(projectId: number, deploymentId: number) {
    const url = `http://deploy-${projectId}-${deploymentId}.${this.screenshotHost}:${this.screenshotPort}`;
    try {
      const file = this.getScreenshotPath(projectId, deploymentId);
      const webshotOptions = {
        defaultWhiteBackground: true,
        renderDelay: 2000,
      };
      await this.screenshotter.webshot(url, file, webshotOptions);
      const publicUrl = this.getPublicUrl(projectId, deploymentId);
      this.eventBus.post(createScreenshotEvent({
        projectId,
        deploymentId,
        url: publicUrl,
      }));
      return publicUrl;
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw Boom.badImplementation();
    }
  }

}
