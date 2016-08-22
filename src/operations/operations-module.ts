
import { inject, injectable } from 'inversify';

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

@injectable()
export default class OperationsModule {

  public static injectSymbol = Symbol('operations-module');
  private readonly logger: logger.Logger;
  private readonly eventBus: EventBus;
  private readonly projectModule: ProjectModule;
  private readonly deploymentModule: DeploymentModule;
  private readonly screenshotModule: ScreenshotModule;

  constructor(
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.projectModule = projectModule;
    this.deploymentModule = deploymentModule;
    this.screenshotModule = screenshotModule;
    this.eventBus = eventBus;
    this.logger = logger;
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
      projectId: projectId,
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

}
