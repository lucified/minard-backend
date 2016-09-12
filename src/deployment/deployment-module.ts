
import * as rx from '@reactivex/rxjs';
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as os from 'os';
import * as path from 'path';
import * as querystring from 'querystring';
import { sprintf } from 'sprintf-js';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import * as logger from '../shared/logger';

import {
  DEPLOYMENT_EVENT_TYPE,
  Deployment,
  DeploymentEvent,
  DeploymentStatus,
  MinardDeployment,
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

const deepcopy = require('deepcopy');
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

@injectable()
export default class DeploymentModule {

  public static injectSymbol = Symbol('deployment-module');

  private readonly gitlab: GitlabClient;
  private readonly deploymentFolder: string;
  private readonly logger: logger.Logger;
  private readonly urlPattern: string;
  private readonly eventBus: EventBus;
  private readonly prepareQueue: any;

  private buildToProject = new Map<number, number>();
  private events: rx.Observable<DeploymentEvent>;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol) deploymentFolder: string,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(deploymentUrlPatternInjectSymbol) urlPattern: string) {
    this.gitlab = gitlab;
    this.deploymentFolder = deploymentFolder;
    this.logger = logger;
    this.eventBus = eventBus;
    this.urlPattern = urlPattern;
    this.events = eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .map(e => e.payload);
    this.prepareQueue = new Queue(1, Infinity);
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.events.subscribe(e => this.setDeploymentState(e.id, e.status, e.projectId));
    // On successfully completed deployments, download, extract and post an 'extracted' event
    this.completedDeployments()
      .filter(event => event.status === 'success')
      .delay(1000)
      .flatMap(event => this.prepareDeploymentAndPostEvent(event), 1)
      .subscribe();
  }

  private async prepareDeploymentAndPostEvent(event: any) {
    try {
      await this.prepareDeploymentForServing(event.projectId, event.id, false);
      this.eventBus.post(createDeploymentEvent(Object.assign({}, event, {status: 'extracted'})));
    } catch (err) {
      this.logger.error(err.message, err);
    }
  }

  private completedDeployments() {
    const events = this.events;
    // The initial events for a new deployment have status 'running' and always include the projectId
    const started = events.filter(e => e.status === 'running' && e.projectId !== undefined);
    // We use a flatMap to return a single event *with* the projectId, when the deployment has finished
    return started
      .flatMap(initial => events.filter(later => later.id === initial.id && this.isFinished(later.status))
        .map(later => ({id: later.id, status: later.status, projectId: initial.projectId as number}))
      );
  }

  private isFinished(status: DeploymentStatus) {
    return status === 'success' || status === 'failed' || status === 'canceled';
  }

  private async getDeployments(projectId: number, url: string): Promise<MinardDeployment[]> {
    try {
      const res = await this.gitlab.fetchJson<Deployment[]>(url);
      return res.map(deployment => this.toMinardModelDeployment(deployment, projectId));
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return [];
      }
      throw Boom.wrap(err);
    }
  }

  public async getProjectDeployments(projectId: number): Promise<MinardDeployment[]> {
    return this.getDeployments(projectId, `projects/${projectId}/builds`);
  };

  public async getBranchDeployments(projectId: number, branchName: string): Promise<MinardDeployment[]> {
    const projectDeployments = await this.getProjectDeployments(projectId);
    return projectDeployments.filter(item => item.ref === branchName);
  };

  // these are highly unoptimized solutions
  // we can do better later by pluggin into
  // persisted deployment events or similar
  public async getLatestSuccessfulProjectDeployment(projectId: number): Promise<MinardDeployment | undefined> {
    const deployments = await this.getProjectDeployments(projectId);
    return deployments.find((deployment: MinardDeployment) => deployment.status === 'success');
  }

  public async getLatestSuccessfulBranchDeployment(
    projectId: number, branchName: string): Promise<MinardDeployment | undefined> {
    const deployments = await this.getBranchDeployments(projectId, branchName);
    return deployments.find((deployment: MinardDeployment) => deployment.status === 'success');
  }

  public async getCommitDeployments(projectId: number, sha: string) {
    try {
      const deployments = await this.gitlab.fetchJson<Deployment[]>(
        `projects/${projectId}/repository/commits/${sha}/builds`);
      return deployments.map((deployment: Deployment) => this.toMinardModelDeployment(deployment, projectId));
    } catch (err) {
      if (err.output.statusCode === 404) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<MinardDeployment | null> {
    try {
      return this.toMinardModelDeployment(
        await this.gitlab.fetchJson<Deployment>(`projects/${projectId}/builds/${deploymentId}`), projectId);
    } catch (err) {
      if (err.output.statusCode === 404) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  private toMinardModelDeployment(deployment: Deployment, projectId: number): MinardDeployment {
    let ret = deepcopy(deployment) as MinardDeployment;
    ret.creator = {
      name: deployment.commit.author_name,
      email: deployment.commit.author_email,
      timestamp: deployment.finished_at || deployment.started_at || deployment.finished_at,
    };
    // rename the commit variable
    ret.commitRef = deployment.commit;
    delete (<any> ret).commit;
    if (ret.status === 'success') {
      (<any> ret).url = sprintf(
        this.urlPattern,
        `${deployment.ref}-${deployment.commit.short_id}-${projectId}-${deployment.id}`);
    }
    return ret;
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
      const deployment = await this.getDeployment(projectId, deploymentId);
      if (!deployment) {
        throw Boom.notFound(
          `No deployment found for: projectId ${projectId}, deploymentId ${deploymentId}`);
      }
      // GitLab will return status === 'running' for a while also after
      // deployment has succeeded. if we know that the deployment is OK,
      // it is okay to skip the status check
      if (deployment.status !== 'success') {
        this.logger.warn(`Tried to prepare deployment for serving while deployment status is ` +
          `"${deployment.status}", projectId: ${projectId}, deploymentId: ${deploymentId}`);
        throw Boom.notFound(`Deployment status is "${deployment.status}" for: projectId ${projectId}, ` +
          `deploymentId ${deploymentId}`);
      }
    }
    try {
      await this.downloadAndExtractDeployment(projectId, deploymentId);
      return await this.moveExtractedDeployment(projectId, deploymentId);
    } catch (err) {
      this.logger.warn(`Failed to prepare deployment ${projectId}_${deploymentId} for serving`, err);
      throw Boom.badImplementation();
    }
  }

  public setDeploymentState(deploymentId: number, state: string, projectId?: number) {
    if (projectId) {
      this.buildToProject.set(deploymentId, projectId);
    }
    const _projectId = this.buildToProject.get(deploymentId);
    if (!_projectId) {
      throw new Error(`Couldn't find projectId for build ${deploymentId}`);
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
    const deployment = await this.getDeployment(projectId, deploymentId);
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
