
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import { isNil, omitBy, values } from 'lodash';
import * as moment from 'moment';
import * as os from 'os';
import * as path from 'path';
import * as querystring from 'querystring';
import { sprintf } from 'sprintf-js';

import {
  Event,
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import * as logger from '../shared/logger';

import { toGitlabTimestamp } from '../shared/time-conversion';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  ProjectModule,
} from '../project';

import {
  BUILD_CREATED_EVENT,
  BUILD_STATUS_EVENT_TYPE,
  BuildCreatedEvent,
  BuildStatusEvent,
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentStatusUpdate,
  MinardDeployment,
  MinardDeploymentStatus,
  MinardJson,
  MinardJsonInfo,
  RepositoryObject,
  createDeploymentEvent,
  deploymentUrlPatternInjectSymbol,
} from './types';

import {
  applyDefaults,
  getGitlabYml,
  getGitlabYmlInvalidJson,
  getValidationErrors,
} from './gitlab-yml';

import { promisify } from '../shared/promisify';

const ncp = promisify(require('ncp'));
const mkpath = promisify(require('mkpath'));
const Queue = require('promise-queue'); // tslint:disable-line

// this lib based on https://github.com/thejoshwolfe/yauzl
const extract = promisify(require('extract-zip'));

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');

export function isRawDeploymentHostname(hostname: string) {
  return getDeploymentKeyFromHost(hostname) !== null;
}

export function getDeploymentKeyFromHost(hostname: string) {
  const match = hostname.match(/\S+-(\d+)-(\d+)\.\S+$/);
  if (!match) {
    return null;
  }
  return {
    projectId: Number(match[1]),
    deploymentId: Number(match[2]),
  };
}

export function getDeploymentKeyFromId(id: string) {
  const match = id.match(/(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    projectId: Number(match[1]),
    deploymentId: Number(match[2]),
  };
}

export function toDbDeployment(deployment: MinardDeployment) {
  return Object.assign({}, deployment, {
    commit: JSON.stringify(deployment.commit),
    finishedAt: deployment.finishedAt && deployment.finishedAt.valueOf(),
    createdAt: deployment.createdAt && deployment.createdAt.valueOf(),
  });
}

export function toMinardDeployment(deployment: any): MinardDeployment {
  const commit = deployment.commit instanceof Object ? deployment.commit : JSON.parse(deployment.commit);
  return Object.assign({}, deployment, {
    commit,
    finishedAt: deployment.finishedAt ? moment(Number(deployment.finishedAt)) : undefined,
    createdAt: deployment.createdAt ? moment(Number(deployment.createdAt)) : undefined,
  }) as MinardDeployment;
}

@injectable()
export default class DeploymentModule {

  public static injectSymbol = Symbol('deployment-module');

  private readonly gitlab: GitlabClient;
  private readonly deploymentFolder: string;
  private readonly logger: logger.Logger;
  private readonly urlPattern: string;
  private readonly eventBus: EventBus;
  private readonly prepareQueue: any;
  private readonly screenshotModule: ScreenshotModule;
  private readonly knex: Knex;
  private readonly projectModule: ProjectModule;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol) deploymentFolder: string,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(deploymentUrlPatternInjectSymbol) urlPattern: string,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject('charles-knex') knex: Knex) {
    this.gitlab = gitlab;
    this.deploymentFolder = deploymentFolder;
    this.logger = logger;
    this.eventBus = eventBus;
    this.urlPattern = urlPattern;
    this.screenshotModule = screenshotModule;
    this.projectModule = projectModule;
    this.knex = knex;
    this.prepareQueue = new Queue(1, Infinity);
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    // subscribe for build created events
    this.eventBus.filterEvents<BuildCreatedEvent>(BUILD_CREATED_EVENT)
      .flatMap(async event => {
        try {
          await this.createDeployment(event);
        } catch (error) {
          this.logger.error(`Failed to create deployment based on BuildCreatedEvent`, { event, error });
        }
      })
      .subscribe();

    // subscribe on build status updates
    this.eventBus.filterEvents<BuildStatusEvent>(BUILD_STATUS_EVENT_TYPE)
      .flatMap(async event => {
        try {
          await this.updateDeploymentStatus(
            event.payload.deploymentId, { buildStatus: event.payload.status });
        } catch (error) {
          this.logger.error(`Failed to update deployment status based on BuildStatusEvent`, { event, error });
        }
      })
      .subscribe();

    // subscribe on finished builds
    this.eventBus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.statusUpdate.buildStatus === 'success')
      .flatMap(event => {
        const { projectId, id } = event.payload.deployment;
        return this.prepareDeploymentForServing(projectId, id, false);
      })
      .subscribe();

    // subscribe on exracted builds
    this.eventBus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.statusUpdate.extractionStatus === 'success')
      .flatMap(event => {
        const { projectId, id } = event.payload.deployment;
        return this.takeScreenshot(projectId, id);
      }, 1)
      .subscribe();
  }

  // internal method
  public async takeScreenshot(projectId: number, deploymentId: number) {
    try {
      await this.updateDeploymentStatus(deploymentId, { screenshotStatus: 'running' });
      await this.screenshotModule.takeScreenshot(projectId, deploymentId);
      await this.updateDeploymentStatus(deploymentId, { screenshotStatus: 'success' });
    } catch (err) {
      await this.updateDeploymentStatus(deploymentId, { screenshotStatus: 'failed' });
    }
  }

  public async createDeployment(event: Event<BuildCreatedEvent>) {
    const payload = event.payload;
    const [ commit, project ] = await Promise.all([
      this.projectModule.getCommit(payload.project_id, payload.sha),
      this.projectModule.getProject(payload.project_id),
    ]);
    if (!commit) {
      this.logger.error(`Commit ${payload.sha} in project ${payload.project_id} not found while in createDeployment`);
      return;
    }
    if (!project) {
      this.logger.error(`Project ${payload.project_id} not found while in createDeployment`);
      return;
    }

    const deployment: MinardDeployment = {
      teamId: project.teamId,
      id: payload.id,
      ref: payload.ref,
      projectId: payload.project_id,
      projectName: payload.project_name,
      buildStatus: 'pending',
      extractionStatus: 'pending',
      screenshotStatus: 'pending',
      status: 'pending',
      commit,
      commitHash: payload.sha,
      createdAt: event.created,
    };
    await this.knex('deployment').insert(toDbDeployment(deployment));
    await this.updateDeploymentStatus(payload.id, {
      buildStatus: payload.status,
    });
  }

  public async getProjectDeployments(projectId: number): Promise<MinardDeployment[]> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('projectId', projectId)
      .orderBy('id', 'DESC');
    return (await select).map(this.toFullMinardDeployment.bind(this));
  };

  public async getBranchDeployments(projectId: number, branchName: string): Promise<MinardDeployment[]> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('ref', branchName)
      .orderBy('id', 'DESC');
    return (await select).map(this.toFullMinardDeployment.bind(this));
  };

  public async getLatestSuccessfulProjectDeployment(projectId: number): Promise<MinardDeployment | undefined> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('status', 'success')
      .orderBy('id', 'DESC')
      .limit(1)
      .first();
    const ret = await select;
    return ret ? this.toFullMinardDeployment(ret) : undefined;
  }

  public async getLatestSuccessfulBranchDeployment(
    projectId: number, branchName: string): Promise<MinardDeployment | undefined> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('status', 'success')
      .andWhere('ref', branchName)
      .orderBy('id', 'DESC')
      .limit(1)
      .first();
    const ret = await select;
    return ret ? this.toFullMinardDeployment(ret) : undefined;
  }

  public async getCommitDeployments(projectId: number, sha: string): Promise<MinardDeployment[]> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('commitHash', sha)
      .orderBy('id', 'DESC');
    return (await select).map(this.toFullMinardDeployment.bind(this));
  }

  public async getDeployment(deploymentId: number): Promise<MinardDeployment | undefined> {
    const select = this.knex.select('*')
      .from('deployment')
      .where('id', deploymentId)
      .limit(1)
      .first();
    const ret = await select;
    if (!ret) {
      return undefined;
    }
    return this.toFullMinardDeployment(ret);
  }

  private toFullMinardDeployment(_deployment: any): MinardDeployment {
    const deployment = toMinardDeployment(_deployment);
    if (deployment.extractionStatus === 'success') {
      deployment.url = sprintf(
         this.urlPattern,
        `${deployment.ref}-${deployment.commit.shortId}-${deployment.projectId}-${deployment.id}`
      );
    }

    if (deployment.screenshotStatus === 'success') {
      deployment.screenshot = this.screenshotModule.getPublicUrl(deployment.projectId, deployment.id);
    }

    deployment.creator = {
      email: deployment.commit.committer.email,
      name: deployment.commit.committer.name,
      timestamp: toGitlabTimestamp(deployment.createdAt),
    };

    return deployment;
  }

  public getDeploymentPath(projectId: number, deploymentId: number) {
    return path.join(this.deploymentFolder, String(projectId), String(deploymentId));
  }

  public isDeploymentReadyToServe(projectId: number, deploymentId: number) {
    const path = this.getDeploymentPath(projectId, deploymentId);
    return fs.existsSync(path);
  }

  public async filesAtPath(projectId: number, shaOrBranchName: string, path: string) {
    const url = `/projects/${projectId}/repository/tree?path=${path}`;
    const ret = await this.gitlab.fetchJsonAnyStatus(url);
    if (ret.status === 404) {
      throw Boom.notFound();
    }
    if (!ret.json) {
      this.logger.error(`Unexpected non-json response from Gitlab for ${url}`, ret);
      throw Boom.badGateway();
    }
    if (!Array.isArray(ret.json)) {
      this.logger.error(`Unexpected non-array response from Gitlab for ${url}`, ret);
      throw Boom.badImplementation();
    }
    return (<RepositoryObject[]> ret.json).map(item => ({
      type: item.type,
      name: item.name,
    }));
  }

  public async getRawMinardJson(projectId: number, shaOrBranchName: string): Promise<any> {
    const query = querystring.stringify({
      filepath: 'minard.json',
    });
    const url = `/projects/${projectId}/repository/blobs/${shaOrBranchName}?${query}`;
    const ret = await this.gitlab.fetch(url);
    if (ret.status === 404) {
      return undefined;
    }
    if (ret.status !== 200) {
      this.logger.warn(`Unexpected response from GitLab when fetching minard.json from ${url}`);
      throw Boom.badGateway();
    }
    return await ret.text();
  }

  public async getParsedMinardJson(projectId: number, shaOrBranchName: string): Promise<any> {
    const raw = await this.getRawMinardJson(projectId, shaOrBranchName);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }

  public async getGitlabYml(projectId: number, shaOrBranchName: string): Promise<string> {
    try {
      const info = await this.getMinardJsonInfo(projectId, shaOrBranchName);
      if (info.effective) {
        return getGitlabYml(info.effective);
      }
      return getGitlabYmlInvalidJson();
    } catch (err) {
      return getGitlabYmlInvalidJson();
    }
  }

  public async getMinardJsonInfo(
    projectId: number, shaOrBranchName: string): Promise<MinardJsonInfo> {
    const content = await this.getRawMinardJson(projectId, shaOrBranchName);
    if (!content) {
      return {
        errors: [],
        content,
        effective: applyDefaults({}),
      };
    }
    let parsed: MinardJson | undefined = undefined;
    let errors: string[];
    try {
      parsed = JSON.parse(content);
      errors = getValidationErrors(parsed);
    } catch (err) {
      errors = [err.message];
      return { content, errors, parsed };
    }

    const effective = errors.length === 0 ? applyDefaults(parsed!) : undefined;

    // if the project does not have a built, we additionally
    // check that the publicRoot exists
    if (effective && errors.length === 0 && effective.publicRoot !== '.' && !effective.build) {
      const path = effective.publicRoot;
      const files = await this.filesAtPath(projectId, shaOrBranchName, path!);
      if (files.length === 0) {
        errors.push(`Repository does not have any any files at path ${path}`);
      }
    }
    return { content, errors, parsed, effective };
  }

  /*
   * Attempt to prepare an already finished successfull deployment
   * so that it can be served
   *
   * Throw error with friendly error message if given deployment
   * is not ready or successfull, or if there is an internal error
   * with preparing the deployment.
   */
  public async prepareDeploymentForServing(projectId: number, deploymentId: number, checkStatus: boolean = true) {
    return this.prepareQueue.add(() => this.doPrepareDeploymentForServing(projectId, deploymentId, checkStatus));
  }

  public async doPrepareDeploymentForServing(projectId: number, deploymentId: number, checkStatus: boolean = true) {
    if (checkStatus) {
      const deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        throw Boom.notFound(
          `No deployment found for: projectId ${projectId}, deploymentId ${deploymentId}`);
      }
      // GitLab will return status === 'running' for a while also after
      // deployment has succeeded. if we know that the deployment is OK,
      // it is okay to skip the status check
      if (deployment.buildStatus !== 'success') {
        this.logger.warn(`Tried to prepare deployment for serving while deployment build status is ` +
          `"${deployment.buildStatus}", projectId: ${projectId}, deploymentId: ${deploymentId}`);

        // From wikipedia (https://en.wikipedia.org/wiki/List_of_HTTP_status_codes)
        // "The requested resource could not be found but may be available in the future.
        // Subsequent requests by the client are permissible"
        throw Boom.notFound(`Deployment status is "${deployment.buildStatus}" for: projectId ${projectId}, ` +
          `deploymentId ${deploymentId}`);
      }
    }
    try {
      this.updateDeploymentStatus(deploymentId, { extractionStatus: 'running' });
      await this.downloadAndExtractDeployment(projectId, deploymentId);
      const finalPath = await this.moveExtractedDeployment(projectId, deploymentId);
      this.updateDeploymentStatus(deploymentId, { extractionStatus: 'success' });
      return finalPath;
    } catch (err) {
      this.logger.warn(`Failed to prepare deployment ${projectId}_${deploymentId} for serving`, err);
      this.updateDeploymentStatus(deploymentId, { extractionStatus: 'failed' });
      throw Boom.badImplementation();
    }
  }

  public async updateDeploymentStatus(deploymentId: number, updates: DeploymentStatusUpdate) {
    let newStatus: MinardDeploymentStatus | undefined = undefined;
    if (updates.screenshotStatus === 'success' || updates.screenshotStatus === 'failed') {
      newStatus = 'success'; // SIC
    } else if (values(updates).indexOf('failed') !== -1 || values(updates).indexOf('canceled') !== -1) {
      newStatus = 'failed';
    } else if (values(updates).indexOf('running') !== -1) {
      newStatus = 'running';
    }

    let deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.error(`Failed to fetch deployment when updating deployment status. Dropping DeploymentEvent`);
      return;
    }

    function updatedStatus(updated: MinardDeploymentStatus | undefined, curr: MinardDeploymentStatus) {
      return updated && updated !== curr ? updated : undefined;
    }

    const status = updatedStatus(newStatus, deployment.status);
    const realUpdates = omitBy({
      status,
      buildStatus: updatedStatus(updates.buildStatus, deployment.buildStatus),
      extractionStatus: updatedStatus(updates.extractionStatus, deployment.extractionStatus),
      screenshotStatus: updatedStatus(updates.screenshotStatus, deployment.screenshotStatus),
      finishedAt: (status === 'success' || status === 'failed') ? moment().valueOf() : undefined,
    }, isNil);

    if (values(realUpdates).length > 0) {
      await this.knex('deployment').update(realUpdates).where('id', deploymentId);
      // this is a bit clumsy, but we need to fetch the deployment again
      // after performing the updates, as otherwise the deployment will
      // not have correct url and screenshot urls set
      deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        this.logger.error(`Failed to fetch deployment after updating deployment status. Dropping DeploymentEvent`);
        throw Boom.badImplementation();
      }
      const payload: DeploymentEvent = {
        teamId: deployment.teamId,
        statusUpdate: omitBy(Object.assign({}, realUpdates, { finishedAt: undefined }), isNil),
        deployment,
      };
      this.eventBus.post(createDeploymentEvent(payload));
    }
  }

  /*
   * Download artifact zip for a deployment from
   * GitLab and extract it into a a temporary path
   */
  public async downloadAndExtractDeployment(projectId: number, deploymentId: number) {
    const url = `/projects/${projectId}/builds/${deploymentId}/artifacts`;

    const response = await this.gitlab.fetch(url);
    const tempDir = path.join(os.tmpdir(), 'minard');
    await mkpath(tempDir);
    let readableStream = (<any> response).body;
    const tempFileName = path.join(tempDir, `minard-${projectId}-${deploymentId}.zip`);
    const writeStream = fs.createWriteStream(tempFileName);

    await new Promise<void>((resolve, reject) => {
      readableStream.pipe(writeStream);
      readableStream.on('end', resolve);
      readableStream.on('error', reject);
      readableStream.resume();
    });

    const extractedTempPath = this.getTempArtifactsPath(projectId, deploymentId);
    await mkpath(extractedTempPath);
    await extract(tempFileName, { dir: extractedTempPath });
    return extractedTempPath;
  }

  public getTempArtifactsPath(projectId: number, deploymentId: number) {
    const tempDir = path.join(os.tmpdir(), 'minard');
    return path.join(tempDir, `minard-${projectId}-${deploymentId}`);
  }

  public async moveExtractedDeployment(projectId: number, deploymentId: number) {
    // fetch minard.json
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.error('Could not get deployment in downloadAndExtractDeployment');
      throw Boom.badImplementation();
    }
    const minardJson = await this.getMinardJsonInfo(projectId, deployment.ref);

    if (!minardJson.effective) {
      // this should never happen as projects are not build if they don't
      // have an effective minard.json
      this.logger.error(`Detected invalid minard.json when moving extracted deployment.`);
      throw Boom.badImplementation();
    }

    // move to final directory
    const extractedTempPath = this.getTempArtifactsPath(projectId, deploymentId);
    const finalPath = this.getDeploymentPath(projectId, deploymentId);
    const sourcePath = minardJson.effective.publicRoot === '.' ? extractedTempPath :
      path.join(extractedTempPath, minardJson.effective.publicRoot);
    const exists = fs.existsSync(sourcePath);
    if (!exists) {
      const msg = `Deployment "${projectId}_${deploymentId}" did not have directory at repo path ` +
        `"${minardJson.effective.publicRoot}". Local sourcePath was ${sourcePath}`;
      this.logger.warn(msg);
      throw Boom.badData(msg, 'no-dir-at-public-root');
    }
    try {
      await mkpath(finalPath);
    } catch (err) {
      this.logger.error(`Could not create directory ${finalPath}`, err);
      throw Boom.badImplementation();
    }
    try {
      await ncp(sourcePath, finalPath);
    } catch (err) {
      this.logger.error(`Could not copy extracted deployment from ${sourcePath} to  `, err);
      throw Boom.badImplementation();
    }
    return finalPath;
  }

};
