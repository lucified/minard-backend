
import * as rx from '@reactivex/rxjs';
import * as Boom from 'boom';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as os from 'os';
import * as path from 'path';
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
  createDeploymentEvent,
  deploymentUrlPatternInjectSymbol,
} from './types';

const mkpath = require('mkpath');
const AdmZip = require('adm-zip'); // tslint:disable-line
const deepcopy = require('deepcopy');

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

    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.events.subscribe(e => this.setDeploymentState(e.id, e.status, e.projectId));
    // On successfully completed deployments, download, extract and post an 'extracted' event
    this.completedDeployments()
      .filter(event => event.status === 'success')
      .flatMap(event => this.downloadAndExtractDeployment(event.projectId, event.id).then(_ => event))
      .subscribe(event =>
        this.eventBus.post(createDeploymentEvent(Object.assign({}, event, {status: 'extracted'}))));
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

  /*
   * Attempt to prepare an already finished successfull deployment
   * so that it can be served
   *
   * Throw error with friendly error message if given deployment
   * is not ready or successfull, or if there is an internal error
   * with preparing the deployment.
   */
  public async prepareDeploymentForServing(projectId: number, deploymentId: number) {
    const deployment = await this.getDeployment(projectId, deploymentId);
    if (!deployment) {
      throw Boom.notFound(
        `No deployment found for: projectId ${projectId}, deploymentId ${deploymentId}`);
    }
    if (deployment.status !== 'success') {
      throw Boom.notFound(
        `Deployment status is "${deployment.status}" for: projectId ${projectId}, ` +
        `deploymentId ${deploymentId}`);
    }
    try {
      await this.downloadAndExtractDeployment(projectId, deploymentId);
    } catch (err) {
      throw Boom.wrap(err);
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
    // console.log(`Build ${_projectId}/${deploymentId}: ${state}`);
  }

  /*
   * Download artifact zip for a deployment from
   * GitLab and extract it into a local folder
   */
  public async downloadAndExtractDeployment(projectId: number, deploymentId: number) {
    const url = `/projects/${projectId}/builds/${deploymentId}/artifacts`;
    const response = await this.gitlab.fetch(url);

    const tempDir = path.join(os.tmpdir(), 'minard');
    mkpath.sync(tempDir);
    let readableStream = (<any> response).body;
    const tempFileName = path.join(tempDir, `minard-${projectId}-${deploymentId}.zip`);
    const writeStream = fs.createWriteStream(tempFileName);

    await new Promise<void>((resolve, reject) => {
      readableStream.pipe(writeStream);
      readableStream.on('end', resolve);
      readableStream.on('error', reject);
      readableStream.resume();
    });

    mkpath.sync(this.getDeploymentPath(projectId, deploymentId));
    const zip = new AdmZip(tempFileName);
    zip.extractAllTo(this.getDeploymentPath(projectId, deploymentId));
    return this.getDeploymentPath(projectId, deploymentId);
  }

};
