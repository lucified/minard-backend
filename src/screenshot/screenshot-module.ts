
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as webshot from 'webshot';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { hostInjectSymbol, portInjectSymbol } from '../server';
import * as logger from '../shared/logger';
import { webshotInjectSymbol } from './types';

import { promisify } from 'bluebird';

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
  private readonly host: string;
  private readonly port: number;
  private readonly webshot: Webshot;

  constructor(
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(hostInjectSymbol) host: string,
    @inject(portInjectSymbol) port: number,
    @inject(webshotInjectSymbol) webshot: Webshot
    ) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.host = host;
    this.port = port;
    this.webshot = webshot;
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
    return path.join('gitlab-data', 'screenshots', String(projectId), String(deploymentId));
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
    const url = `http://deploy-${projectId}-${deploymentId}.${this.host}:${this.port}`;
    try {
      const dir = this.getScreenshotDir(projectId, deploymentId);
      const file = this.getScreenshotPath(projectId, deploymentId);
      await (promisify(mkpath) as any)(dir);
      await promisify(this.webshot)(url, file);
    } catch (err) {
      // TODO: detect issues taking screenshot that are not Minard's fault
      this.logger.error(`Failed to create screenshot for url ${url}`, err);
      throw Boom.badImplementation();
    }
  }

}
