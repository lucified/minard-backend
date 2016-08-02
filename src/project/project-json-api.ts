
import { inject, injectable } from 'inversify';

import { standardIdRef } from '../shared/json-api-serialisation';
import ProjectModule, { MinardProject } from './project-module';

import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';

const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

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
  attributes: ['name', 'description', 'project', 'commits', 'project'],
  ref: standardIdRef,
  commits: nonIncludedSerialization,
  project: nonIncludedSerialization,
  included: true,
};

export const projectSerialization = {
  attributes: ['name', 'description', 'branches'],
  branches: branchSerialization,
  included: true,
};

export function toJsonApi(project: MinardProject) {
  project.branches.map(item => {
    item.project = project;
  });

  // do not include commits
  projectSerialization.branches.commits.included = false;
  const serialized = new Serializer('project', projectSerialization).serialize(project);
  return serialized;
};


@injectable()
export default class ProjectJsonApi {

  public static injectSymbol = Symbol('project-json-api');

  private projectModule: ProjectModule;

  public constructor(
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule) {
    this.projectModule = projectModule;
  }

  public async getProject(projectId: number) {
    const project = await this.projectModule.getProject(projectId);
    if (!project) {
      throw new MinardError(MINARD_ERROR_CODE.NOT_FOUND);
    }
    return toJsonApi(project);
  }

}

