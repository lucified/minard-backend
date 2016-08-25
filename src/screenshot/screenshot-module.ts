
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { sprintf } from 'sprintf-js';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { externalBaseUrlInjectSymbol } from '../server/types';
import * as logger from '../shared/logger';
import { createScreenshotEvent } from './types';

import {
  Screenshotter,
  screenshotFolderInjectSymbol,
  screenshotUrlPattern,
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
  private readonly urlPattern: string;
  private readonly screenshotter: Screenshotter;
  private readonly folder: string;
  private readonly externalBaseUrl: string;

  constructor(
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(screenshotUrlPattern) urlPattern: string,
    @inject(screenshotterInjectSymbol) screenshotter: Screenshotter,
    @inject(screenshotFolderInjectSymbol) folder: string,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.urlPattern = urlPattern;
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
