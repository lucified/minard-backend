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
  id: number;
  latestSuccessfullyDeployedCommit?: ApiCommit;
}

export interface ApiBranch extends MinardBranch {
  type: 'branch';
  id: string;
  project: number;
  latestCommit: ApiCommit;
  latestSuccessfullyDeployedCommit?: ApiCommit;
  minardJson: any;
}

export interface ApiDeployment extends MinardDeploymentPlain {
  id: string;
  // this is not exposed in serialized responses, but it is internally helpful
  commitHash: string;
  screenshot: string | null;
}

export interface ApiCommit extends MinardCommit {
  hash: string;
  deployments: ApiDeployment[];
}

export interface ApiActivityProject {
  id: number;
  name: string;
}

export interface ApiActivityBranch {
  id: string;
  name: string;
}

export interface ApiActivityDeployment extends MinardDeploymentPlain {
  id: string;
}

export interface ApiActivityCommit extends MinardCommit {
  hash: string;
}

export interface ApiActivity extends MinardActivityPlain {
  type: 'activity';
  id: string;
  deployment: ApiActivityDeployment;
  project: ApiActivityProject;
  branch: ApiActivityBranch;
  commit: ApiActivityCommit;
}

export type ApiEntity = ApiActivity | ApiProject | ApiCommit | ApiDeployment | ApiBranch;
export type ApiEntities = ApiActivity[] | ApiProject[] | ApiCommit[] | ApiDeployment[] | ApiBranch[];
