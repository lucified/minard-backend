
import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';
import { inject, injectable } from 'inversify';

import DeploymentModule, { MinardDeployment } from '../deployment/deployment-module';
import ProjectModule, { MinardBranch, MinardProject } from '../project/project-module';

const deepcopy = require('deepcopy');

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

export function standardIdRef(_: any, item: any) {
  return String(item.id);
}

export const nonIncludedSerialization = {
  ref: standardIdRef,
  included: false,
};

export const commitSerialization = {
  attributes: ['message', 'author', 'branch'],
  ref: standardIdRef,
  included: true,
};

export const branchSerialization = {
  attributes: ['name', 'description', 'project', 'commits', 'project', 'deployments'],
  ref: standardIdRef,
  commits: nonIncludedSerialization,
  project: nonIncludedSerialization,
  deployments: nonIncludedSerialization,
  included: true,
};

export const projectSerialization = {
  attributes: ['name', 'description', 'branches'],
  branches: branchSerialization,
  included: true,
};

export const deploymentSerialization = {
  attributes: ['finished_at', 'status', 'commit', 'user', 'url'],
  commit: commitSerialization,
  user: {
    attributes: ['username'],
    ref: standardIdRef,
  },
};

export function deploymentToJsonApi(deployments: any) {
  const serialized = new Serializer('deployment', deploymentSerialization)
    .serialize(deployments);
  return serialized;
};

export function projectToJsonApi(project: MinardProject) {
  project.branches.map(item => {
      item.project = project;
  });
  // do not include commits
  projectSerialization.branches.commits.included = false;
  const serialized = new Serializer('project', projectSerialization).serialize(project);
  return serialized;
};

export interface ApiProject extends MinardProject {
  branches: ApiBranch[];
}

export interface ApiBranch extends MinardBranch {
  deployments: ApiDeployment[];
}

export interface ApiDeployment extends MinardDeployment {

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
    const deployment = await this.deploymentModule.getDeployment(projectId, deploymentId);
    return deploymentToJsonApi(deployment) as ApiDeployment;
  }

  public async getProject(projectId: number) {
    const project = await this.projectModule.getProject(projectId) as ApiProject;
    if (!project) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    const augmentedProject = await this.augmentProject(project);
    return projectToJsonApi(augmentedProject);
  }

  private async augmentBranch(projectId: number, branch: MinardBranch): Promise<ApiBranch> {
    const ret = deepcopy(branch) as ApiBranch;
    ret.deployments = await this.deploymentModule.getBranchDeployments(projectId, branch.name);
    return ret;
  }

  private async augmentProject(project: MinardProject): Promise<ApiProject> {
    const promises = project.branches.map(branch => {
      return this.augmentBranch(project.id, branch);
    });
    const ret = deepcopy(project) as ApiProject;
    ret.branches = await Promise.all<ApiBranch>(promises);
    return ret;
  }

}
