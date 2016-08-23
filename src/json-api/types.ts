import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  MinardProjectPlain,
} from '../project/';

import {
  MinardActivityPlain,
} from '../activity';

import {
  MinardDeploymentPlain,
} from '../deployment/';

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

// The API-prefix interfaces are for richly composed objects
// that can be directly passed to the JSON API serializer
//
// Note that these object structures may contain circular references
// and are typically not serializable with JSON.stringify(...)

export interface ApiProject extends MinardProjectPlain {
  type: 'project';
  id: string;
  branches: ApiBranch[];
}

export interface ApiBranch extends MinardBranch {
  type: 'branch';
  id: string;
  project: ApiProject;
  deployments: ApiDeployment[];
  commits: ApiCommit[];
}

export interface ApiDeployment extends MinardDeploymentPlain {
  id: string;
  commit: ApiCommit;
  screenshot: string | null;
}

export interface ApiCommit extends MinardCommit {
  hash: string;
  deployments: ApiDeployment[];
}

export interface ApiActivity extends MinardActivityPlain {
  type: 'activity';
  id: string;
  deployment: ApiDeployment;
  project: ApiProject;
  branch: ApiBranch;
}

export type ApiEntity = ApiActivity | ApiProject | ApiCommit | ApiDeployment | ApiBranch;
export type ApiEntities = ApiActivity[] | ApiProject[] | ApiCommit[] | ApiDeployment[] | ApiBranch[];
