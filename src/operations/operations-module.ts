
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
    this.eventBus = eventBus;
    this.logger = logger;

    this.assureScreenshotsGenerated();
  }

  /*
   * Assure that all successful and extracted deployments have screenshots
   */
  public async assureScreenshotsGenerated() {
    const projectIds = await this.projectModule.getAllProjectIds();

    const pending = projectIds.map((projectId: number) => ({
      projectId: projectId,
      deploymentsPromise: this.deploymentModule.getProjectDeployments(projectId),
    }));

    // using for loop to allow for await
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const deployments = await item.deploymentsPromise;
      deployments.filter((deployment: MinardDeployment) =>
        deployment.status === 'success'
        && this.deploymentModule.isDeploymentReadyToServe(item.projectId, deployment.id)
        && !this.screenshotModule.deploymentHasScreenshot(item.projectId, deployment.id))
        .forEach(deployment => {
          this.logger.info(`Creating missing screenshot for deployment ${deployment.id} of project ${item.projectId}.`);
          this.screenshotModule.takeScreenshot(item.projectId, deployment.id);
        });
    }
  }

}
