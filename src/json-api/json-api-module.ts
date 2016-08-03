
import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';
import { inject, injectable } from 'inversify';

import DeploymentModule, { MinardDeployment, MinardDeploymentPlain } from '../deployment/deployment-module';
import ProjectModule, {
  MinardBranch,
  MinardCommit,
  MinardProject,
  MinardProjectPlain,
} from '../project/project-module';

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
  ref: standardIdRef,
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

// The Api-prefix interfaces are for richly composed objects
// that can be directly passed to the JSON API serializer

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

  public async getDeployment(deploymentId: string): Promise<JsonApiResponse> {
    const deployment = await this.getApiDeployment(deploymentId);
    if (!deployment) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    return deploymentToJsonApi(deployment);
  }

  public async getProjects(teamId: number) {
    const projects = await this.projectModule.getProjects(teamId);
    const promises = projects.map((project: MinardProject) => this.toApiProject(project));
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

  public async getBranch(branchId: string): Promise<JsonApiResponse> {
    const branch = await this.getApiBranch(branchId);
    if (!branch) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    return branchToJsonApi(branch);
  }

  private async getApiProject(apiProjectId: string | number): Promise<ApiProject | null> {
    const projectId = Number(apiProjectId);
    const project = await this.projectModule.getProject(projectId);
    if (!project) {
      return null;
    }
    return await this.toApiProject(project);
  }

  private async getApiDeployment(apiDeploymentId: string): Promise<ApiDeployment | null> {
     const splitted = apiDeploymentId.split('-');
     if (!splitted || splitted.length !== 2) {
       throw new MinardError(MINARD_ERROR_CODE.BAD_REQUEST);
     }
     const projectId = Number(splitted[0]);
     const deploymentId = Number(splitted[1]);
     const deployment = await this.deploymentModule.getDeployment(projectId, deploymentId);
     if (!deployment) {
       return null;
     }
     return await this.toApiDeployment(String(projectId), deployment);
  }

  private async getApiBranch(apiBranchId: string): Promise<ApiBranch | null> {
    const splitted = apiBranchId.split('-');
    if (!splitted || splitted.length !== 2) {
      throw new MinardError(MINARD_ERROR_CODE.BAD_REQUEST);
    }
    const projectId = Number(splitted[0]);
    const branchName = String(splitted[1]);

    const projectPromise = this.getApiProject(projectId);
    const branchPromise = this.projectModule.getBranch(projectId, branchName);
    const project = await projectPromise;
    const branch = await branchPromise;
    if (!project || !branch) {
      return null;
    }
    return await this.toApiBranch(project, branch);
  }

  private async toApiCommit(commit: MinardCommit): Promise<ApiCommit> {
    // this function is async because it probably needs to be that in the future
    return <ApiCommit> commit;
  }

  private async toApiDeployment(projectId: string, deployment: MinardDeployment): Promise<ApiDeployment> {
    const ret = deepcopy(deployment) as ApiDeployment;
    ret.id = `${projectId}-${deployment.id}`;
    ret.commit = await this.toApiCommit(deployment._commit);
    return ret;
  }

  private async toApiBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch> {
    const ret = deepcopy(branch) as ApiBranch;
    ret.id = `${project.id}-${branch.name}`;
    const deployments = await this.deploymentModule.getBranchDeployments(Number(project.id), branch.name);
    const promises = deployments.map((deployment: MinardDeployment) => this.toApiDeployment(project.id, deployment));
    ret.deployments = await Promise.all<ApiDeployment>(promises);
    ret.project = project;
    return ret;
  }

  private async toApiProject(project: MinardProject): Promise<ApiProject> {
    const ret = deepcopy(project) as ApiProject;
    ret.id = String(project.id);
    const promises = project.branches.map(branch => {
      return this.toApiBranch(ret, branch);
    });
    ret.branches = await Promise.all<ApiBranch>(promises);
    return ret;
  }

}
