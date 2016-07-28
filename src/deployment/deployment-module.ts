
import { inject, injectable } from 'inversify';

import { GitlabClient } from '../shared/gitlab-client';
import { Deployment } from  '../shared/gitlab.d.ts';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mkpath = require('mkpath');
const AdmZip = require('adm-zip'); // tslint:disable-line

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');

export interface DeploymentKey {
  projectId: number;
  buildId: number;
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
    buildId: Number(match[2]),
  };
}

@injectable()
export default class DeploymentModule {

  public static injectSymbol = Symbol('deployment-module');

  private gitlab: GitlabClient;
  private deploymentFolder: string;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol) deploymentFolder: string) {
    this.gitlab = gitlab;
    this.deploymentFolder = deploymentFolder;
  }

  public getDeployments(projectId: number): Promise<Deployment[] | void> {
    return this.gitlab.fetchJson<Deployment[]>(`projects/${projectId}/builds`);
  };

  public async getDeployment(projectId: number, deploymentId: number) {
    try {
      return await this.gitlab.fetchJson<Deployment>(`projects/${projectId}/builds/${deploymentId}`);
    } catch (err) {
      return null;
    }
  }

  public async jsonApiGetDeployments(projectId: number) {
    const gitlabData = await this.getDeployments(projectId);
    return DeploymentModule.gitlabResponseToJsonApi(gitlabData);
  }

  public static gitlabResponseToJsonApi(gitlabResponse: any) {
    const normalized = this.normalizeGitLabResponse(gitlabResponse);
    const opts = {
      attributes: ['finished_at', 'status', 'commit', 'user'],
      commit: {
        attributes: ['message'],
        ref: function (_: any, commit: any) {
            return String(commit.id);
        },
      },
      user: {
        attributes: ['username'],
        ref: function (_: any, user: any) {
            return String(user.id);
        },
      },
    };
    const serialized = new Serializer('deployment', opts).serialize(normalized);
    return serialized;
  };

  public static normalizeGitLabResponse(gitlabResponse: any) {
    return gitlabResponse.map((item: any) => {
      return {
        id: item.id,
        user: {
          id: item.user.id,
          username: item.user.username,
        },
        commit: {
          id: item.commit.id,
          message: item.commit.message,
        },
        finished_at: item.finished_at,
        status: item.status,
      };
    });
  };

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
      throw Error(`No deployment found for: projectId ${projectId}, ` +
        `deploymentId ${deploymentId}`);
    }
    if (deployment.status !== 'success') {
      throw Error(`Deployment status is "${deployment.status}" for: projectId ${projectId}, ` +
        `deploymentId ${deploymentId}`);
    }
    try {
      await this.downloadAndExtractDeployment(projectId, deploymentId);
    } catch (err) {
      throw Error(`Could not prepare deployment for serving (projectId ${projectId}, ` +
        `deploymentId ${deploymentId})`);
    }
  }

  /*
   * Download artifact zip for a deployment from
   * GitLab and extract it into a local folder
   */
  public async downloadAndExtractDeployment(projectId: number, buildId: number) {
    const url = `/projects/${projectId}/builds/${buildId}/artifacts`;
    const response = await this.gitlab.fetch(url);

    const tempDir = path.join(os.tmpdir(), 'minard');
    mkpath.sync(tempDir);
    let readableStream = (<any> response).body;
    const tempFileName =  path.join(tempDir, `minard-${projectId}-${buildId}.zip`);
    const writeStream = fs.createWriteStream(tempFileName);

    await new Promise<void>((resolve, reject) => {
      readableStream.pipe(writeStream);
      readableStream.on('end', resolve);
      readableStream.on('error', reject);
      readableStream.resume();
    });

    mkpath.sync(this.getDeploymentPath(projectId, buildId));
    const zip = new AdmZip(tempFileName);
    zip.extractAllTo(this.getDeploymentPath(projectId, buildId));
    return this.getDeploymentPath(projectId, buildId);
  }

};
