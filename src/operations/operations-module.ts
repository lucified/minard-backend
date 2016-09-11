
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import { differenceBy } from 'lodash';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import * as logger from '../shared/logger';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  ProjectModule,
} from '../project';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment';

import {
  ActivityModule,
} from '../activity';

@injectable()
export default class OperationsModule {

  public static injectSymbol = Symbol('operations-module');
  private readonly logger: logger.Logger;
  private readonly eventBus: EventBus;
  private readonly projectModule: ProjectModule;
  private readonly deploymentModule: DeploymentModule;
  private readonly screenshotModule: ScreenshotModule;
  private readonly activityModule: ActivityModule;

  constructor(
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule) {
    this.projectModule = projectModule;
    this.deploymentModule = deploymentModule;
    this.screenshotModule = screenshotModule;
    this.eventBus = eventBus;
    this.logger = logger;
    this.activityModule = activityModule;
  }

  public async runBasicMaintenceTasks() {
    this.assureScreenshotsGenerated();
  }

  /*
   * Assure that all successful and extracted deployments have screenshots
   */
  public async assureScreenshotsGenerated() {
    let projectIds: number[];
    try {
      projectIds = await this.projectModule.getAllProjectIds();
    } catch (err) {
      this.logger.error('Could not get project ids', err);
      return;
    }
    const pending = projectIds.map((projectId: number) => ({
      projectId,
      deploymentsPromise: this.deploymentModule.getProjectDeployments(projectId),
    }));

    // using for loops to allow for awaiting
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      let deployments: MinardDeployment[] | null = null;
      try {
        deployments = await item.deploymentsPromise;
      } catch (err) {
        this.logger.error(`Failed to fetch deployments for project ${item.projectId}`);
      }
      if (deployments) {
        // both awaiting and triggering the assure operation here within
        // the for loop is slow, but this can be a good thing, as it will reduce
        // the momentary load caused by this operation
        await this.assureScreenshotsGeneratedForDeployments(item.projectId, deployments);
      }
    }
  }

  private async assureScreenshotsGeneratedForDeployments(projectId: number, deployments: MinardDeployment[]) {
    const filtered = deployments.filter((deployment: MinardDeployment) =>
      deployment.status === 'success'
      && this.deploymentModule.isDeploymentReadyToServe(projectId, deployment.id));
    for (let j = 0; j < filtered.length; j++) {
      const deployment = deployments[j];
      const hasScreenshot = await this.screenshotModule
        .deploymentHasScreenshot(projectId, deployment.id);
      if (!hasScreenshot) {
        this.logger.info(`Creating missing screenshot for deployment ${deployment.id} of project ${projectId}.`);
        try {
          await this.screenshotModule.takeScreenshot(projectId, deployment.id);
        } catch (err) {
          this.logger.warn(`Failed to take screenshot for deployment ${deployment.id} of project ${projectId}.`);
        }
      }
    }
  }

  /*
   * Assure that all finished deployments have a corresponding activity item
   */
  public async assureDeploymentActivity() {
    let projectIds: number[];
    try {
      projectIds = await this.projectModule.getAllProjectIds();
    } catch (err) {
      this.logger.error('Could not get project ids for assureDeploymentActivity');
      return;
    }
    return Promise.all(projectIds.map((item: number) => this.assureDeploymentActivityForProject(item)));
  }

  public async getMissingDeploymentActivityForProject(projectId: number) {
    const [ expected, existing ] = await Promise.all([
      await this.getProjectDeploymentActivity(projectId),
      await this.activityModule.getProjectActivity(projectId),
    ]);
    if (expected === null) {
      this.logger.error(`Project ${projectId} not found in getMissingDeploymentActivity.`);
      throw Boom.badGateway();
    }
    const mappedExisting = existing.map(item => ({
      projectId: item.projectId,
      deploymentId: item.deployment.id,
    }));
    return differenceBy(expected, mappedExisting, JSON.stringify);
  }

  public async assureDeploymentActivityForProject(projectId: number): Promise<void> {
    try {
      const missing = await this.getMissingDeploymentActivityForProject(projectId);
      await Promise.all(missing.map(async item => {
        this.logger.info(`Creating missing deployment activity for ${item.projectId}-${item.deploymentId}`);
        const activity = await this.activityModule.createDeploymentActivity(item.projectId, item.deploymentId);
        const hasScreenshot = await this.screenshotModule.deploymentHasScreenshot(projectId, item.deploymentId);
        activity.deployment.screenshot = hasScreenshot ? this.screenshotModule
          .getPublicUrl(projectId, item.deploymentId) : undefined;
        await this.activityModule.addActivity(activity);
      }));
    } catch (err) {
      this.logger.error(
        `Failed to create missing deployment activity for ${projectId}`, err);
    }
  }

  public async getProjectDeploymentActivity(projectId: number) {
    const [ project, deployments ] = await Promise.all([
      this.projectModule.getProject(projectId),
      this.deploymentModule.getProjectDeployments(projectId),
    ]);
    if (!project) {
      return null;
    }
    return deployments
      .filter((minardDeployment: MinardDeployment) =>
        minardDeployment.status === 'success' || minardDeployment.status === 'failed')
      .map((minardDeployment: MinardDeployment) => {
      return {
        projectId,
        deploymentId: minardDeployment.id,
      };
    });
  }

}
