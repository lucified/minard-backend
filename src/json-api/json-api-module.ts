
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { Commit } from '../shared/gitlab.d.ts';

import {
  ApiCommit,
  ApiBranch,
  ApiProject,
  ApiDeployment,
  ApiEntity,
  ApiEntities,
  ApiActivity,
  JsonApiResponse,
} from './types';

import { serializeApiEntity } from './serialization';

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
  MinardCommit,
  MinardProject,
  ProjectModule,
} from '../project/';

const deepcopy = require('deepcopy');
const memoize = require('memoizee');


@injectable()
export class InternalJsonApi {

  public static injectSymbol = Symbol('internal-json-api');

  private readonly deploymentModule: DeploymentModule;
  private readonly projectModule: ProjectModule;
  private readonly activityModule: ActivityModule;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule?: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule?: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule?: ActivityModule) {
    if (deploymentModule) {
      this.deploymentModule = deploymentModule;
    }
    if (projectModule) {
      this.projectModule = projectModule;
    }
    if (activityModule) {
      this.activityModule = activityModule;
    }
  }

  public async getApiCommit(projectId: number, hash: string): Promise<ApiCommit | null> {
    const commit = await this.projectModule.getCommit(projectId, hash);
    return commit ? this.toApiCommit(projectId, commit) : null;
  }

  public async getApiProject(apiProjectId: string | number): Promise<ApiProject | null> {
    const projectId = Number(apiProjectId);
    const project = await this.projectModule.getProject(projectId);
    return project ? this.toApiProject(project) : null;
  }

  public async getApiProjects(teamId: number): Promise<ApiProject[] | null> {
    const projects = await this.projectModule.getProjects(teamId);
    const promises = projects.map((project: MinardProject) => this.toApiProject(project));
    return await Promise.all<ApiProject>(promises);
  }

  public async getApiDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment | null> {
     const deployment = await this.deploymentModule.getDeployment(projectId, deploymentId);
     if (!deployment) {
       return null;
     }
     return await this.toApiDeployment(projectId, deployment);
  }

  public async getApiBranch(projectId: number, branchName: string): Promise<ApiBranch | null> {
    if (!branchName) {
      throw Boom.badRequest('branchName is missing');
    }
    const projectPromise = this.getApiProject(projectId);
    const branchPromise = this.projectModule.getBranch(projectId, branchName);
    const project = await projectPromise;
    const branch = await branchPromise;
    if (!project || !branch) {
      return null;
    }
    return await this.toApiBranch(project, branch);
  }

  public async getApiActivityForTeam(teamId: number): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getTeamActivity(teamId);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async getApiActivityForProject(projectId: number): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getProjectActivity(projectId);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async toApiActivity(activity: MinardActivity): Promise<ApiActivity> {
    const project = await this.toApiProject(activity.project);
    const branch = await this.toApiBranch(project, activity.branch);
    return {
      type: 'activity',
      branch: branch,
      project: project,
      id: `${activity.project.id}-${activity.deployment.id}`,
      timestamp: activity.timestamp,
      activityType: activity.activityType,
      deployment: await this.toApiDeployment(Number(project.id), activity.deployment),
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
          minardDeployments.map(deployment => this.toApiDeployment(projectId, deployment, ret)));
      }
    }
    ret.id = `${projectId}-${commit.id}`;
    ret.hash = commit.id;
    return ret;
  }

  public async toApiDeployment(
    projectId: number,
    deployment: MinardDeployment,
    commit?: ApiCommit): Promise<ApiDeployment> {
    const ret = deepcopy(deployment) as ApiDeployment;
    ret.id = `${projectId}-${deployment.id}`;
    if (commit) {
      ret.commit = commit;
    } else if (deployment.commitRef) {
      ret.commit = await this.toApiCommit(projectId,
        this.projectModule.toMinardCommit(deployment.commitRef as Commit));
    }
    return ret;
  }

  public async toApiBranch(
    project: ApiProject,
    branch: MinardBranch,
    deployments?: ApiDeployment[],
    commits?: ApiCommit[]): Promise<ApiBranch> {

    const ret = deepcopy(branch) as ApiBranch;
    ret.project = project;
    ret.id = `${ret.project.id}-${branch.name}`;

    if (deployments && commits) {
      ret.deployments = deployments;
      ret.commits = commits;
    } else {
      // We wish to avoid toApiDeployment() from fetching commits, since
      // we have already fetched everything we need. However, we don't yet
      // have the deployment references needed by ApiCommit ready. For that
      // reason, we are passing a reference object, and later replacing them
      // with references to proper ApiCommits.
      const minardDeployments = await this.deploymentModule.getBranchDeployments(Number(ret.project.id), branch.name);
      ret.deployments = await Promise.all<ApiDeployment>(minardDeployments.map(
        (deployment: MinardDeployment) => this.toApiDeployment(
          Number(ret.project.id), deployment, { hash: deployment.commitRef.id } as ApiCommit)));
      ret.commits = await Promise.all<ApiCommit>(branch.commits.map(
      (commit: MinardCommit) => {
        const commitDeploys = ret.deployments.filter(
          deployment => deployment.commit.hash === commit.id);
        return this.toApiCommit(Number(ret.project.id), commit, commitDeploys);
      }));
      // Replace commit reference objects with proper
      // ApiCommits that were just prepared
      ret.deployments.forEach((deployment: ApiDeployment) => {
      deployment.commit = ret.commits.find((commit: ApiCommit) =>
        commit.hash === deployment.commit.hash) as ApiCommit;
      });
    }
    return ret;
  }

  public async toApiProject(project: MinardProject, branches?: ApiBranch[]): Promise<ApiProject> {
    const ret = deepcopy(project) as ApiProject;
    ret.type = 'project';
    ret.id = String(project.id);
    if (branches) {
      ret.branches = branches;
    } else {
      ret.branches = await Promise.all<ApiBranch>(project.branches.map(branch => this
        .toApiBranch(ret, branch)));
    }
    return ret;
  }

}

@injectable()
export default class JsonApiModule extends InternalJsonApi {

  public static injectSymbol = Symbol('json-api-module');

  private api: InternalJsonApi;
  private memoized: any[];

  constructor(
    @inject(InternalJsonApi.injectSymbol) api: InternalJsonApi,
    @inject(DeploymentModule.injectSymbol) deploymentModule?: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule?: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule?: ActivityModule) {
    super();
    this.api = api;
    this.memoize();
  }

  private memoize() {
    const api = this.api;

    const memoizedMethods = [{
      name: 'getApiProject',
      normalizer: (args: any) => args[0],
    }, {
      name: 'getApiBranch',
      normalizer: (args: any) => `${(args[0])}-${(args[1])}`,
    }, {
      name: 'toApiProject',
      normalizer: (args: any) => args[0].id,
    }, {
      name: 'toApiBranch',
      normalizer: (args: any) => `${args[0].id}-${args[1].name}`,
    }, {
      name: 'toApiDeployment',
      normalizer: (args: any) => `${args[0]}-${args[1].id}`,
    }, {
      name: 'toApiCommit',
      normalizer: (args: any) => `${args[0]}-${args[1].id}`,
    }];

    // Memoize everything we want memoized
    this.memoized = memoizedMethods.map(method => {
      const originalMethod = (<any> api)[method.name].bind(api);
      const memoized = memoize(originalMethod, {
        promise: true,
        normalizer: method.normalizer,
      });
      (<any> api)[method.name] = memoized;
      return memoized;
    }, this);

    // Map all of our own methods to this.api
    Object.getOwnPropertyNames(InternalJsonApi.prototype)
      .filter(prop => typeof (<any> api)[prop] === 'function' && prop.indexOf('Api') >= 0)
      .forEach(method => {
        (<any> this)[method] = (<any> api)[method].bind(api);
      });

  }

  private invalidate() {
    this.memoized.forEach(method => method.clear());
  }

  private async getEntity(entityName: string, serializeName: string, ...args: any[]) {
    this.invalidate();
    const method = (<any> this)[`getApi${entityName}`] as (...aargs: any[]) => Promise<any>;
    console.log(method);
    const entity = (await method.apply(this, args)) as ApiEntity | ApiEntities | null;
    if (!entity) {
      throw Boom.notFound(`${entityName} not found`);
    }
    return serializeApiEntity(serializeName, entity);
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<JsonApiResponse> {
    return this.getEntity('Deployment', 'deployment', projectId, deploymentId);
  }

  public async getProjects(teamId: number): Promise<JsonApiResponse> {
    return this.getEntity('Projects', 'project', teamId);
  }

  public async getProject(projectId: number): Promise<JsonApiResponse> {
    return this.getEntity('Project', 'project');
  }

  public async getBranch(projectId: number, branchName: string): Promise<JsonApiResponse> {
    return this.getEntity('Branch', 'branch', projectId, branchName);
  }

  public async getCommit(projectId: number, hash: string): Promise<JsonApiResponse> {
    return this.getEntity('Commit', 'commit', projectId, hash);
  }

  public async getTeamActivity(teamId: number): Promise<JsonApiResponse> {
    return this.getEntity('ActivityForTeam', 'activity', teamId);
  }

  public async getProjectActivity(projectId: number): Promise<JsonApiResponse> {
    return this.getEntity('ActivityForProject', 'activity', projectId);
  }
}

