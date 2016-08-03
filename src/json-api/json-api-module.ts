
import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';
import { inject, injectable } from 'inversify';

import DeploymentModule, { MinardDeployment } from '../deployment/deployment-module';
import ProjectModule, { MinardBranch, MinardCommit, MinardProject } from '../project/project-module';

const deepcopy = require('deepcopy');

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

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
  attributes: ['finished_at', 'status', 'commit', 'user', 'url'],
  ref: standardIdRef,
  commit: nonIncludedSerialization,
  included: true,
};

export const projectSerialization = {
  attributes: ['name', 'description', 'branches'],
  branches: nonIncludedSerialization,
  included: true,
};

export const commitSerialization = {
  attributes: ['message', 'author', 'branch'],
  ref: standardIdRef,
  branch: nonIncludedSerialization,
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

export function branchToJsonApi(branch: ApiBranch | ApiBranch[]) {
  const serialized = new Serializer('branch',
    branchCompoundSerialization).serialize(branch);
  return serialized;
}

export function deploymentToJsonApi(deployments: any) {
  const serialized = new Serializer('deployment',
    deploymentCompoundSerialization).serialize(deployments);
  return serialized;
};

export function projectToJsonApi(project: MinardProject | MinardProject[]) {
  const serialized = new Serializer('project',
    projectCompoundSerialization).serialize(project);
  return serialized;
};

// The Api-prefix interfaces are for richly composed objects
// that can be directly passed to the JSON API serializer

export interface ApiProject extends MinardProject {
  branches: ApiBranch[];
}

export interface ApiBranch extends MinardBranch {
  project: ApiProject;
  deployments: ApiDeployment[];
  commits: ApiCommit[];
}

export interface ApiDeployment extends MinardDeployment {
  commit: ApiCommit;
}

export interface ApiCommit extends MinardCommit {
  branch: ApiBranch;
}

@injectable()
export default class JsonApiModule {

  public static injectSymbol = Symbol('json-api-module');

  private deploymentModule: DeploymentModule;
  private projectModule: ProjectModule;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule) {
    this.deploymentModule = deploymentModule;
    this.projectModule = projectModule;
  }

  public async getProjectDeployments(projectId: number) {
    const deployments = await this.deploymentModule.getProjectDeployments(projectId);
    return deploymentToJsonApi(deployments);
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment> {
    const deployment = await this.getApiDeployment(projectId, deploymentId);
    return deploymentToJsonApi(deployment) as ApiDeployment;
  }

  public async getProjects(teamId: number) {
    const projects = await this.projectModule.getProjects(teamId);
    const promises = projects.map((project: MinardProject) => this.augmentProject(project));
    const augmentedProjects = await Promise.all<ApiProject>(promises);
    return projectToJsonApi(augmentedProjects);
  }

  public async getProject(projectId: number): Promise<JsonApiResponse> {
    const project = await this.getApiProject(projectId);
    if (!project) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    return projectToJsonApi(project);
  }

  public async getBranch(projectId: number, branchName: string): Promise<JsonApiResponse> {
    const branch = await this.getApiBranch(projectId, branchName);
    if (!branch) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    return branchToJsonApi(branch);
  }

  private async getApiProject(projectId: number): Promise<ApiProject | null> {
    const project = await this.projectModule.getProject(projectId) as ApiProject;
    if (!project) {
      return null;
    }
    return await this.augmentProject(project);
  }

  private async getApiDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment | null> {
     const deployment = await this.deploymentModule.getDeployment(projectId, deploymentId);
     if (!deployment) {
       return null;
     }
     return await this.augmentDeployment(deployment);
  }

  private async getApiBranch(projectId: number, branchName: string): Promise<ApiBranch | null> {
    const projectPromise = this.getApiProject(projectId);
    const branchPromise = this.projectModule.getBranch(projectId, branchName);
    const project = await projectPromise;
    const branch = await branchPromise;
    if (!project || !branch) {
      return null;
    }
    const augmentedBranch = await this.augmentBranch(project, branch);
    return augmentedBranch;
  }

  private async augmentCommit(commit: MinardCommit): Promise<ApiCommit> {
    // this function is async because it probably needs to be that in the future
    return <ApiCommit> commit;
  }

  private async augmentDeployment(deployment: MinardDeployment): Promise<ApiDeployment> {
    const ret = deepcopy(deployment) as ApiDeployment;
    ret.commit = await this.augmentCommit(deployment._commit);
    return ret;
  }

  private async augmentBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch> {
    const ret = deepcopy(branch) as ApiBranch;
    const deployments = await this.deploymentModule.getBranchDeployments(project.id, branch.name);
    const promises = deployments.map(this.augmentDeployment);
    ret.deployments = await Promise.all<ApiDeployment>(promises);
    ret.project = project;
    return ret;
  }

  private async augmentProject(project: MinardProject): Promise<ApiProject> {
    const ret = deepcopy(project) as ApiProject;
    const promises = project.branches.map(branch => {
      return this.augmentBranch(ret, branch);
    });
    ret.branches = await Promise.all<ApiBranch>(promises);
    return ret;
  }

}
