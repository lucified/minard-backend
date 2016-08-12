
import * as Boom from 'boom';
import { inject, injectable, interfaces } from 'inversify';

import { Commit } from '../shared/gitlab.d.ts';

import {
  ActivityModule,
  MinardActivity,
  MinardActivityPlain,
} from '../activity';

import {
  DeploymentModule,
  MinardDeployment,
  MinardDeploymentPlain,
} from '../deployment/';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  MinardProjectPlain,
  ProjectModule,
} from '../project/';

const deepcopy = require('deepcopy');
const memoize = require('memoizee');

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

interface MemoizedJsonApiModule {
  toApiProject: (project: MinardProject) => Promise<ApiProject>;
  toApiBranch: (project: MinardProject, branch: MinardBranch) => Promise<ApiBranch>;
}

export interface JsonApiEntity {
  type: "commits" | "deployments" | "projects" | "branches";
  id: string;
  attributes?: any;
  relationships?: any;
}

export interface JsonApiResponse {
  data: JsonApiEntity | JsonApiEntity[];
  included?: JsonApiEntity[];
}

export function standardIdRef(_: any, item: any) {
  return String(item.id);
}

export const nonIncludedSerialization = {
  ref: standardIdRef,
  included: false,
};

export const branchSerialization = {
  attributes: ['name', 'description', 'project', 'commits', 'project', 'deployments'],
  ref: standardIdRef,
  commits: nonIncludedSerialization,
  project: nonIncludedSerialization,
  deployments: nonIncludedSerialization,
  included: true,
};

export const deploymentSerialization =  {
  attributes: ['finished_at', 'status', 'commit', 'url'],
  ref: standardIdRef,
  commit: nonIncludedSerialization,
  included: true,
};

export const projectSerialization = {
  attributes: ['name', 'description', 'branches', 'activeCommitters'],
  branches: nonIncludedSerialization,
  ref: standardIdRef,
  included: true,
};

export const commitSerialization = {
  attributes: ['message', 'author', 'committer', 'hash'],
  ref: standardIdRef,
  included: true,
};

export const activitySerialization = {
  attributes: ['timestamp', 'activityType', 'deployment', 'project', 'branch'],
  ref: standardIdRef,
  deployment: nonIncludedSerialization,
  branch: nonIncludedSerialization,
  project: nonIncludedSerialization,
  included: true,
};

export const branchCompoundSerialization = deepcopy(branchSerialization);
branchCompoundSerialization.commits = commitSerialization;
branchCompoundSerialization.deployments = deploymentSerialization;
branchCompoundSerialization.project = projectSerialization;

export const projectCompoundSerialization = deepcopy(projectSerialization);
projectCompoundSerialization.branches = branchSerialization;

export const deploymentCompoundSerialization = deepcopy(deploymentSerialization);
deploymentCompoundSerialization.commit = commitSerialization;

export const activityCompoundSerialization = deepcopy(activitySerialization);
activityCompoundSerialization.deployment = deploymentCompoundSerialization;
activityCompoundSerialization.branch = branchSerialization;
activityCompoundSerialization.project = projectSerialization;

export function branchToJsonApi(branch: ApiBranch | ApiBranch[]) {
  const serialized = new Serializer('branch',
    branchCompoundSerialization).serialize(branch);
  return serialized;
}

export function deploymentToJsonApi(deployment: ApiDeployment | ApiDeployment[]) {
  const serialized = new Serializer('deployment',
    deploymentCompoundSerialization).serialize(deployment);
  return serialized;
};

export function projectToJsonApi(project: ApiProject | ApiProject[]) {
  const serialized = new Serializer('project',
    projectCompoundSerialization).serialize(project);
  return serialized;
};

export function commitToJsonApi(commit: ApiCommit | ApiCommit[]) {
  return new Serializer('commit', commitSerialization)
    .serialize(commit);
}

export function activityToJsonApi(activity: ApiActivity | ApiActivity[]) {
  return new Serializer('activity', activityCompoundSerialization)
    .serialize(activity);
}

// The API-prefix interfaces are for richly composed objects
// that can be directly passed to the JSON API serializer
//
// Note that these object structures may contain circular references
// and are typically not serializable with JSON.stringify(...)

export interface ApiProject extends MinardProjectPlain {
  id: string;
  branches: ApiBranch[];
}

export interface ApiBranch extends MinardBranch {
  id: string;
  project: ApiProject;
  deployments: ApiDeployment[];
  commits: ApiCommit[];
}

export interface ApiDeployment extends MinardDeploymentPlain {
  id: string;
  commit: ApiCommit;
}

export interface ApiCommit extends MinardCommit {
  hash: string;
}

export interface ApiActivity extends MinardActivityPlain {
  id: string;
  deployment: ApiDeployment;
  project: ApiProject;
  branch: ApiBranch;
}

interface InternalJsonApiInterface {
 getApiCommit(projectId: number, hash: string): Promise<ApiCommit | null>;
 getApiProject(apiProjectId: string | number): Promise<ApiProject | null>;
 getApiProjects(teamId: number): Promise<ApiProject[] | null>;
 getApiDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment | null>;
 getApiBranch(projectId: number, branchName: string): Promise<ApiBranch | null>;
 getApiActivityForTeam(teamId: number): Promise<ApiActivity[] | null>;
 getApiActivityForProject(projectId: number): Promise<ApiActivity[] | null>;
 toApiActivity(activity: MinardActivity): Promise<ApiActivity>;
 toApiCommit(projectId: number, commit: MinardCommit): Promise<ApiCommit>;
 toApiDeployment(projectId: number, deployment: MinardDeployment): Promise<ApiDeployment>;
 toApiBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch>;
 toApiProject(project: MinardProject): Promise<ApiProject>;
}

@injectable()
export class InternalJsonApi implements InternalJsonApiInterface {

  public static factoryInjectSymbol = Symbol('internal-json-api');
  public static injectSymbol = Symbol('internal-json-api');

  private readonly deploymentModule: DeploymentModule;
  private readonly projectModule: ProjectModule;
  private readonly activityModule: ActivityModule;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule) {
    this.deploymentModule = deploymentModule;
    this.projectModule = projectModule;
    this.activityModule = activityModule;
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
      branch: branch,
      project: project,
      id: `${activity.project.id}-${activity.deployment.id}`,
      timestamp: activity.timestamp,
      activityType: activity.activityType,
      deployment: await this.toApiDeployment(4, activity.deployment),
    };
  }

  public async toApiCommit(projectId: number, commit: MinardCommit): Promise<ApiCommit> {
    const ret = deepcopy(commit) as ApiCommit;
    if (!commit) {
      throw Boom.badImplementation();
    }
    ret.id = `${projectId}-${commit.id}`;
    ret.hash = commit.id;
    return ret;
  }

  public async toApiDeployment(projectId: number, deployment: MinardDeployment): Promise<ApiDeployment> {
    const ret = deepcopy(deployment) as ApiDeployment;
    ret.id = `${projectId}-${deployment.id}`;
    if (deployment.commitRef) {
      ret.commit = await this.toApiCommit(projectId,
        this.projectModule.toMinardCommit(deployment.commitRef as Commit));
    }
    return ret;
  }

  public async toApiBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch> {
    const ret = deepcopy(branch) as ApiBranch;
    ret.id = `${project.id}-${branch.name}`;
    const deployments = await this.deploymentModule.getBranchDeployments(Number(project.id), branch.name);
    const commitPromises = branch.commits.map(
      (commit: MinardCommit) => this.toApiCommit(Number(project.id), commit));
    const deploymentPromises = deployments.map(
      (deployment: MinardDeployment) => this.toApiDeployment(Number(project.id), deployment));
    ret.deployments = await Promise.all<ApiDeployment>(deploymentPromises);
    ret.commits = await Promise.all<ApiCommit>(commitPromises);
    ret.project = project;
    return ret;
  }

  public async toApiProject(project: MinardProject): Promise<ApiProject> {
    const ret = deepcopy(project) as ApiProject;
    ret.id = String(project.id);
    const promises = project.branches.map(branch => this.toApiBranch(ret, branch));
    ret.branches = await Promise.all<ApiBranch>(promises);
    return ret;
  }
}

@injectable()
export class MemoizedInternalJsonApi implements InternalJsonApiInterface {

  public static injectSymbol = Symbol('memoized-internal-json-api');

  // We do not inherit the InternalJsonApi, because this way we can
  // pass a mock implementation of InternalJsonApi in unit tests
  //
  // (This results in a little bit more boilerplate, seen below)
  //
  public getApiProject: typeof InternalJsonApi.prototype.getApiProject;
  public getApiBranch: typeof InternalJsonApi.prototype.getApiBranch;
  public getApiCommit: typeof InternalJsonApi.prototype.getApiCommit;
  public getApiProjects: typeof InternalJsonApi.prototype.getApiProject;
  public getApiDeployment: typeof InternalJsonApi.prototype.getApiDeployment;
  public getApiActivityForTeam: typeof InternalJsonApi.prototype.getApiActivityForTeam;
  public getApiActivityForProject: typeof InternalJsonApi.prototype.getApiActivityForProject;
  public toApiDeployment: typeof InternalJsonApi.prototype.toApiDeployment;
  public toApiProject: typeof InternalJsonApi.prototype.toApiProject;
  public toApiBranch: typeof InternalJsonApi.prototype.toApiBranch;
  public toApiCommit: typeof InternalJsonApi.prototype.toApiCommit;
  public toApiActivity: typeof InternalJsonApi.prototype.toApiActivity;

  constructor(
    @inject(InternalJsonApi.injectSymbol) api: InternalJsonApi) {

    // Note that we need to re-assign the functions also to the instance
    // methods of the wrapped object. Otherwise its this.foo() calls within
    // its methods will not be using these memoized versions

    this.getApiProject = api.getApiProject = memoize(api.getApiProject.bind(api), {
      promise: true,
      normalizer: (args: any) => (<number> args[0]),
    });
    this.getApiBranch = api.getApiBranch = memoize(api.getApiBranch.bind(api), {
      promise: true,
      normalizer: (args: any) => `${(<number> args[0])}-${(<string> args[1])}`,
    });
    this.getApiCommit = api.getApiCommit.bind(api);
    this.getApiProjects = api.getApiProjects.bind(api);
    this.getApiDeployment = api.getApiDeployment.bind(api);
    this.getApiActivityForTeam = api.getApiActivityForTeam.bind(api);
    this.getApiActivityForProject = api.getApiActivityForProject.bind(api);
    this.toApiProject = api.toApiProject = memoize(api.toApiProject.bind(api), {
      promise: true,
      normalizer: (args: any) => (<MinardProject> args[0]).id,
    });
    this.toApiBranch = api.toApiBranch = memoize(api.toApiBranch.bind(api), {
      promise: true,
      normalizer: (args: any) => `${(<MinardProject> args[0]).id}-${(<MinardBranch> args[1]).name}`,
    });
    this.toApiDeployment = api.getApiDeployment = memoize(api.toApiDeployment.bind(api), {
      promise: true,
      normalizer: (args: any) => `${(<number> args[0])}-${(<MinardDeployment> args[1]).id}`,
    });
    this.toApiCommit = api.toApiCommit = memoize(api.toApiCommit.bind(api), {
      promise: true,
      normalizer: (args: any) => `${(<number> args[0])}-${(<MinardCommit> args[1]).id}`,
    });
    this.toApiActivity = api.toApiActivity.bind(api);
  }
}

@injectable()
export default class JsonApiModule {

  public static injectSymbol = Symbol('json-api-module');
  private readonly factory: interfaces.Factory<InternalJsonApi>;

  constructor(
    @inject(InternalJsonApi.factoryInjectSymbol) factory: interfaces.Factory<InternalJsonApi>) {
    this.factory = factory;
  }

  private createContext(): InternalJsonApi {
    const ctx = this.factory();
    return <InternalJsonApi> ctx;
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<JsonApiResponse> {
    const deployment = await this.createContext().getApiDeployment(projectId, deploymentId);
    if (!deployment) {
      throw Boom.notFound('Deployment not found');
    }
    return deploymentToJsonApi(deployment);
  }

  public async getProjects(teamId: number): Promise<JsonApiResponse> {
    const projects = await this.createContext().getApiProjects(teamId);
    if (!projects) {
      throw Boom.notFound();
    }
    return projectToJsonApi(projects);
  }

  public async getProject(projectId: number): Promise<JsonApiResponse> {
    const project = await this.createContext().getApiProject(projectId);
    if (!project) {
      throw Boom.notFound('Project not found');
    }
    return projectToJsonApi(project);
  }

  public async getBranch(projectId: number, branchName: string): Promise<JsonApiResponse> {
    const branch = await this.createContext().getApiBranch(projectId, branchName);
    if (!branch) {
      throw Boom.notFound('Branch not found');
    }
    return branchToJsonApi(branch);
  }

  public async getCommit(projectId: number, hash: string): Promise<JsonApiResponse> {
    const commit = await this.createContext().getApiCommit(projectId, hash);
    if (!commit) {
      throw Boom.notFound('Commit not found');
    }
    return commitToJsonApi(commit);
  }

  public async getTeamActivity(teamId: number): Promise<JsonApiResponse> {
    const activity = await this.createContext().getApiActivityForTeam(teamId);
    if (!activity) {
      throw Boom.notFound();
    }
    return activityToJsonApi(activity);
  }

  public async getProjectActivity(projectId: number): Promise<JsonApiResponse> {
    const activity = await this.createContext().getApiActivityForProject(projectId);
    if (!activity) {
      throw Boom.notFound();
    }
    return activityToJsonApi(activity);
  }

}
