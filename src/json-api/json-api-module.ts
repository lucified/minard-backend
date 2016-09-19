
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as moment from 'moment';

import { toGitlabTimestamp, toMoment } from '../shared/time-conversion';

import {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiProject,
} from './types';

import {
  ActivityModule,
  MinardActivity,
} from '../activity';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment/';

import {
  MinardBranch,
  MinardProject,
  ProjectModule,
} from '../project/';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  MinardCommit,
} from '../shared/minard-commit';

const deepcopy = require('deepcopy');

@injectable()
export class JsonApiModule {

  public static injectSymbol = Symbol('json-api-injectsymbol');
  public static factoryInjectSymbol = Symbol('json-api-factory-injectsymbol');

  private readonly deploymentModule: DeploymentModule;
  private readonly projectModule: ProjectModule;
  private readonly activityModule: ActivityModule;
  private readonly screenshotModule: ScreenshotModule;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule) {
      this.deploymentModule = deploymentModule;
      this.projectModule = projectModule;
      this.activityModule = activityModule;
      this.screenshotModule = screenshotModule;
  }

  public async getCommit(projectId: number, hash: string): Promise<ApiCommit | null> {
    const commit = await this.projectModule.getCommit(projectId, hash);
    return commit ? this.toApiCommit(projectId, commit) : null;
  }

  public async getProject(apiProjectId: string | number): Promise<ApiProject | null> {
    const projectId = Number(apiProjectId);
    const project = await this.projectModule.getProject(projectId);
    return project ? this.toApiProject(project) : null;
  }

  public async createProject(teamId: number, name: string, description?: string): Promise<ApiProject> {
    const id = await this.projectModule.createProject(teamId, name, description);
    const project = await this.getProject(id);
    if (!project) {
      // createProject in projectModule will throw
      // if there are errors, so we should always be
      // able to get the project afterwards
      throw Boom.badImplementation();
    }
    return project;
  }

  public async deleteProject(projectId: number) {
    await this.projectModule.deleteProject(projectId);
  }

  public async editProject(
    projectId: number, attributes: { name?: string, description?: string }): Promise<ApiProject> {
    await this.projectModule.editProject(projectId, attributes);
    const project = await this.getProject(projectId);
    if (!project) {
      // createProject in projectModule will throw
      // if there are errors, so we should always be
      // able to get the project afterwards
      throw Boom.badImplementation();
    }
    return project;
  }

  public async getProjects(teamId: number): Promise<ApiProject[] | null> {
    const projects = await this.projectModule.getProjects(teamId);
    if (!projects) {
      return null;
    }
    const promises = projects.map((project: MinardProject) => this.toApiProject(project));
    return await Promise.all<ApiProject>(promises);
  }

  public async getProjectBranches(projectId: number): Promise<ApiBranch[] | null> {
    const project = await this.getProject(projectId);
    const branches = await this.projectModule.getProjectBranches(projectId);
    if (!branches || !project) {
      return null;
    }
    return await Promise.all(branches.map(branch => this.toApiBranch(project, branch)));
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment | null> {
     const deployment = await this.deploymentModule.getDeployment(deploymentId);
     if (!deployment) {
       return null;
     }
     return await this.toApiDeployment(projectId, deployment);
  }

  public async getBranch(projectId: number, branchName: string): Promise<ApiBranch | null> {
    if (!branchName) {
      throw Boom.badRequest('branchName is missing');
    }
    const [project, branch] = await Promise.all([
      this.getProject(projectId),
      this.projectModule.getBranch(projectId, branchName),
    ]);
    if (!project || !branch) {
      return null;
    }
    return await this.toApiBranch(project, branch);
  }

  public async getBranchCommits(
    projectId: number,
    branchName: string,
    until?: moment.Moment,
    count: number = 10): Promise<ApiCommit[] | null> {
    const [ minardDeployments, minardCommits ] = await Promise.all([
      this.deploymentModule.getBranchDeployments(projectId, branchName),
      this.projectModule.getBranchCommits(projectId, branchName, until, count),
    ]);
    const deployments = await Promise.all(minardDeployments.map(item => this.toApiDeployment(projectId, item)));
    if (!minardCommits) {
      throw Boom.notFound('branch not found');
    }
    return Promise.all(minardCommits.map(commit => {
      const commitDeployments = deployments.filter(deployment => deployment.commitHash === commit.id);
      return this.toApiCommit(projectId, commit, commitDeployments);
    }));
  }

  public async getTeamActivity(
    teamId: number, until?: string, count: number = 10): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getTeamActivity(teamId, until ? toMoment(until) : undefined, count);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async getProjectActivity(
    projectId: number, until?: string, count: number = 10): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getProjectActivity(
      projectId, until ? toMoment(until) : undefined, count);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async toApiActivity(activity: MinardActivity): Promise<ApiActivity> {
    const commit = Object.assign({}, activity.commit, {
      id: `${activity.projectId}-${activity.commit.id}`,
      hash: activity.commit.id,
    });
    const project = {
      id: String(activity.projectId),
      name: activity.projectName,
    };
    const branch = {
      id: `${activity.projectId}-${activity.branch}`,
      name: activity.branch,
    };
    const deployment = Object.assign({}, activity.deployment, {
      id: `${activity.projectId}-${activity.deployment.id}`,
    });
    delete deployment.ref;
    const timestamp = toGitlabTimestamp(activity.timestamp);
    return {
      id: `${activity.projectId}-${activity.deployment.id}`,
      type: 'activity',
      branch,
      commit,
      project,
      timestamp,
      activityType: activity.activityType,
      deployment,
    };
  }

  public async toApiCommit(
    projectId: number,
    commit: MinardCommit,
    deployments?: ApiDeployment[]): Promise<ApiCommit> {
    const ret = deepcopy(commit) as ApiCommit;
    if (!commit) {
      throw Boom.badImplementation();
    }
    if (deployments) {
      ret.deployments = deployments;
    } else {
      const minardDeployments = await this.deploymentModule.getCommitDeployments(projectId, commit.id);
      if (!minardDeployments) {
        ret.deployments = [];
      } else {
        ret.deployments = await Promise.all<ApiDeployment>(
          minardDeployments.map((deployment: MinardDeployment) => this.toApiDeployment(projectId, deployment)));
      }
    }
    ret.id = `${projectId}-${commit.id}`;
    ret.hash = commit.id;
    return ret;
  }

  // TODO: this method does not need to be async
  public async toApiDeployment(
    projectId: number,
    deployment: MinardDeployment): Promise<ApiDeployment> {
    return {
      id: `${projectId}-${deployment.id}`,
      commitHash: deployment.commitHash,
      url: deployment.url,
      screenshot: deployment.screenshot,
      creator: deployment.creator,
      ref: deployment.ref,
      status: deployment.status,
      buildStatus: deployment.buildStatus,
      extractionStatus: deployment.buildStatus,
      screenshotStatus: deployment.screenshotStatus,
    };
  }

  public async toApiBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch> {
    const [ minardJson, latestCommit, minardDeployment ] = await Promise.all([
      this.deploymentModule.getMinardJsonInfo(Number(project.id), branch.name),
      this.toApiCommit(Number(project.id), branch.latestCommit),
      this.deploymentModule.getLatestSuccessfulBranchDeployment(project.id, branch.name),
    ]);
    const latestSuccessfullyDeployedCommit = minardDeployment ?
      await this.minardDeploymentToApiCommit(project.id, minardDeployment) : undefined;
    return {
      type: 'branch',
      id: `${project.id}-${branch.name}`,
      project: project.id,
      name: branch.name,
      minardJson,
      latestCommit,
      latestSuccessfullyDeployedCommit,
      latestActivityTimestamp: branch.latestActivityTimestamp,
    };
  }

  private async minardDeploymentToApiCommit(projectId: number, minardDeployment: MinardDeployment): Promise<ApiCommit> {
    const deployment = await this.toApiDeployment(projectId, minardDeployment);
    return await this.toApiCommit(projectId, minardDeployment.commit, [deployment]);
  }

  public async toApiProject(project: MinardProject): Promise<ApiProject> {
    const minardDeployment = await this.deploymentModule.getLatestSuccessfulProjectDeployment(project.id);
    const latestSuccessfullyDeployedCommit = minardDeployment ?
      await this.minardDeploymentToApiCommit(project.id, minardDeployment) : undefined;
    return {
      type: 'project',
      id: project.id,
      name: project.name,
      path: project.path,
      latestActivityTimestamp: project.latestActivityTimestamp,
      latestSuccessfullyDeployedCommit,
      activeCommitters: project.activeCommitters,
      description: project.description,
      repoUrl: project.repoUrl,
    };
  }

}
