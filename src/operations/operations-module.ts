import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import { differenceBy, isNil, omitBy } from 'lodash';

import {
  ActivityModule,
} from '../activity';
import {
  DeploymentEvent,
  DeploymentModule,
  MinardDeployment,
} from '../deployment';
import { ProjectModule } from '../project';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';

@injectable()
export default class OperationsModule {
  public static injectSymbol = Symbol('operations-module');

  constructor(
    @inject(
      ProjectModule.injectSymbol,
    ) private readonly projectModule: ProjectModule,
    @inject(
      DeploymentModule.injectSymbol,
    ) private readonly deploymentModule: DeploymentModule,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(
      ActivityModule.injectSymbol,
    ) private readonly activityModule: ActivityModule,
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
  ) {}

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
      deploymentsPromise: this.deploymentModule.getProjectDeployments(
        projectId,
      ),
    }));

    // using for loops to allow for awaiting
    for (const item of pending) {
      let deployments: MinardDeployment[] | null = null;
      try {
        deployments = await item.deploymentsPromise;
      } catch (err) {
        this.logger.error(
          `Failed to fetch deployments for project ${item.projectId}`,
        );
      }
      if (deployments) {
        // both awaiting and triggering the assure operation here within
        // the for loop is slow, but this can be a good thing, as it will reduce
        // the momentary load caused by this operation
        await this.assureScreenshotsGeneratedForDeployments(
          item.projectId,
          deployments,
        );
      }
    }
  }

  private async assureScreenshotsGeneratedForDeployments(
    projectId: number,
    deployments: MinardDeployment[],
  ) {
    const filtered = deployments.filter(
      (deployment: MinardDeployment) =>
        deployment.extractionStatus === 'success' &&
        deployment.screenshotStatus === 'failed',
    );
    for (let j = 0; j < filtered.length; j++) {
      const deployment = deployments[j];
      this.logger.info(
        `Creating missing screenshot for deployment ${deployment.id} of project ${projectId}.`,
      );
      await this.deploymentModule.takeScreenshot(
        projectId,
        deployment.id,
        deployment.commit.shortId,
      );
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
      this.logger.error(
        'Could not get project ids for assureDeploymentActivity',
      );
      return;
    }
    return Promise.all(
      projectIds.map(item => this.assureDeploymentActivityForProject(item)),
    );
  }

  public async getMissingDeploymentActivityForProject(projectId: number) {
    const [expected, existing] = await Promise.all([
      this.getProjectDeploymentActivity(projectId),
      this.activityModule.getProjectActivity(projectId),
    ]);
    if (expected === null) {
      this.logger.error(
        `Project ${projectId} not found in getMissingDeploymentActivity.`,
      );
      throw Boom.badGateway();
    }
    if (existing === null) {
      throw Boom.badGateway();
    }
    const mappedExisting = existing.map(item => ({
      projectId: item.projectId,
      deploymentId: item.deployment.id,
    }));
    return differenceBy(expected, mappedExisting, JSON.stringify);
  }

  public async assureDeploymentActivityForProject(
    projectId: number,
  ): Promise<void> {
    try {
      const missing = await this.getMissingDeploymentActivityForProject(
        projectId,
      );
      await Promise.all(
        missing.map(async item => {
          this.logger.info(
            `Creating missing deployment activity for ${item.projectId}-${item.deploymentId}`,
          );
          const deployment = await this.deploymentModule.getDeployment(
            item.deploymentId,
          );
          if (!deployment) {
            throw Error('Could not get deployment');
          }
          const event: DeploymentEvent = {
            teamId: deployment.teamId,
            deployment,
            statusUpdate: {
              status: deployment.status,
            },
          };
          const activity = await this.activityModule.createDeploymentActivity(
            event,
          );
          await this.activityModule.addActivity(activity);
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to create missing deployment activity for ${projectId}`,
        err,
      );
    }
  }

  public async cleanupRunningDeployments() {
    try {
      const deployments = await this.deploymentModule.getDeploymentsByStatus(
        'running',
      );
      deployments.map(deployment => {
        const update = omitBy(
          {
            buildStatus: deployment.buildStatus === 'running'
              ? 'failed'
              : undefined,
            extractionStatus: deployment.extractionStatus === 'running'
              ? 'failed'
              : undefined,
            screenshotStatus: deployment.screenshotStatus === 'running'
              ? 'failed'
              : undefined,
          },
          isNil,
        );
        this.logger.warn(
          `Cleaning up "running" deployment ${deployment.id}`,
          update,
        );
        this.deploymentModule.updateDeploymentStatus(deployment.id, update);
      });
    } catch (err) {
      this.logger.error('Failed to cleanup running deployments', err);
    }
  }

  public async getProjectDeploymentActivity(projectId: number) {
    const [project, deployments] = await Promise.all([
      this.projectModule.getProject(projectId),
      this.deploymentModule.getProjectDeployments(projectId),
    ]);
    if (!project) {
      return null;
    }
    return deployments
      .filter(
        (minardDeployment: MinardDeployment) =>
          minardDeployment.status === 'success' ||
          minardDeployment.status === 'failed',
      )
      .map((minardDeployment: MinardDeployment) => {
        return {
          projectId,
          deploymentId: minardDeployment.id,
        };
      });
  }

  public async regenerateGitlabPasswords() {
    const users = await this.gitlab.getUsers();
    const responses: {username: string}[] = [];
    for (const user of users) {
      const password = this.gitlab.getUserPassword(user.username);
      const response = await this.gitlab.modifyUser(user.id, { password });
      responses.push({ username: response.username });
    }
    return responses;
  }
}
