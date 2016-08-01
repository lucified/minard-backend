
import { inject, injectable } from 'inversify';

import { GitlabClient } from '../shared/gitlab-client';
import { Deployment } from  '../shared/gitlab.d.ts';

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

export interface MinardDeployment extends Deployment {
  url: string;
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

  private gitlab: GitlabClient;
  private deploymentFolder: string;

  private buildToProject = new Map<number, number>();

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol) deploymentFolder: string) {
    this.gitlab = gitlab;
    this.deploymentFolder = deploymentFolder;
  }

  public async getProjectDeployments(projectId: number): Promise<MinardDeployment[] | null> {
    try {
      return (await this.gitlab.fetchJson<Deployment[]>(`projects/${projectId}/builds`))
        .map(this.toMinardModelDeployment);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return null;
      }
      throw new MinardError(
        MINARD_ERROR_CODE.INTERNAL_SERVER_ERROR,
        err.message);
      }
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
