
import { inject, injectable } from 'inversify';

import { GitlabClient } from '../shared/gitlab-client';
import { Deployment } from  '../shared/gitlab.d.ts';
import * as logger from  '../shared/logger';

import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mkpath = require('mkpath');
const AdmZip = require('adm-zip'); // tslint:disable-line
const deepcopy = require('deepcopy');

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');

export interface DeploymentKey {
  projectId: number;
  deploymentId: number;
}

export interface MinardDeploymentPlain {
  ref: string;
  status: string;
  url?: string;
  screenshot?: string;
  finished_at: string;
}

export interface MinardDeployment extends MinardDeploymentPlain {
  id: number;
  _commit: any;
}

export function isRawDeploymentHostname(hostname: string) {
  return getDeploymentKey(hostname) !== null;
}

export function getDeploymentKey(hostname: string) {
  const match = hostname.match(/\S+-(\d+)-(\d+)\.\S+$/);
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

  private buildToProject = new Map<number, number>();

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol) deploymentFolder: string,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.gitlab = gitlab;
    this.deploymentFolder = deploymentFolder;
    this.logger = logger;
  }

  private async getDeployments(url: string): Promise<MinardDeployment[]> {
    try {
      const res = await this.gitlab.fetchJson<Deployment[]>(url);
      return res.map(this.toMinardModelDeployment);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return [];
      }
      throw new MinardError(
        MINARD_ERROR_CODE.INTERNAL_SERVER_ERROR,
        err.message);
      }
  }

  public async getProjectDeployments(projectId: number): Promise<MinardDeployment[]> {
    return this.getDeployments(`projects/${projectId}/builds`);
  };

  public async getBranchDeployments(projectId: number, branchName: string): Promise<MinardDeployment[]> {
    const projectDeployments = await this.getProjectDeployments(projectId);
    return projectDeployments.filter(item => item.ref === branchName);
  };

  public async getDeployment(projectId: number, deploymentId: number) {
    try {
      return this.toMinardModelDeployment(
        await this.gitlab.fetchJson<Deployment>(`projects/${projectId}/builds/${deploymentId}`), projectId);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return null;
      }
      throw new MinardError(
        MINARD_ERROR_CODE.INTERNAL_SERVER_ERROR,
        err.message);
    }
  }

  private toMinardModelDeployment(deployment: Deployment, projectId: number): MinardDeployment {
    let ret = deepcopy(deployment);
    // rename the commit variable
    ret._commit = deployment.commit;
    delete ret.commit;
    if (ret.status === 'success') {
      (<any> deployment).url = `http://${deployment.ref}-` +
        `${deployment.commit.short_id}-${projectId}-${deployment.id}.localhost:8000`;
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
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND,
        `No deployment found for: projectId ${projectId}, deploymentId ${deploymentId}`);
    }
    if (deployment.status !== 'success') {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND,
        `Deployment status is "${deployment.status}" for: projectId ${projectId}, ` +
        `deploymentId ${deploymentId}`);
    }
    try {
      await this.downloadAndExtractDeployment(projectId, deploymentId);
    } catch (err) {
      throw new MinardError(
        MINARD_ERROR_CODE.INTERNAL_SERVER_ERROR,
        `Could not prepare deployment for serving (projectId ${projectId}, ` +
        `deploymentId ${deploymentId})`);
    }
  }

  public setDeploymentState(buildId: number, state: string, projectId?: number) {
    if (projectId) {
      this.buildToProject.set(buildId, projectId);
    }
    const _projectId = this.buildToProject.get(buildId);
    if (!_projectId) {
      throw new Error(`Couldn't find projectId for build ${buildId}`);
    }
    console.log(`Build ${_projectId}/${buildId}: ${state}`);
    if (state === 'success') {
      this.downloadAndExtractDeployment(_projectId, buildId)
        .then(path => {
          console.log(`Extracted the artifacts to path ${path}`);
        });
    }
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
    const tempFileName =  path.join(tempDir, `minard-${projectId}-${deploymentId}.zip`);
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
