
import {
  MinardCommit,
} from '../shared/minard-commit';

import {
  MinardBranch,
  MinardProject,
  MinardProjectPlain,
} from '../project/';

import {
  MinardDeploymentCreator,
  MinardDeploymentStatus,
} from '../deployment/';

interface MemoizedJsonApiModule {
  toApiProject: (project: MinardProject) => Promise<ApiProject>;
  toApiBranch: (project: MinardProject, branch: MinardBranch) => Promise<ApiBranch>;
}

export interface JsonApiEntity {
  type: 'commits' | 'deployments' | 'projects' | 'branches';
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

export interface ApiBranch {
  type: 'branch';
  id: string;
  project: number;
  name: string;
  latestActivityTimestamp: string;
  latestCommit: ApiCommit;
  latestSuccessfullyDeployedCommit?: ApiCommit;
  minardJson: any;
}

export interface ApiDeployment {
  id: string;
  ref: string;
  buildStatus: MinardDeploymentStatus;
  extractionStatus: MinardDeploymentStatus;
  screenshotStatus: MinardDeploymentStatus;
  status: MinardDeploymentStatus;
  url?: string;
  screenshot?: string;
  creator: MinardDeploymentCreator;
  // this is not exposed in serialized responses, but it is internally helpful
  commitHash: string;
}

export interface ApiCommit extends MinardCommit {
  hash: string;
  deployments: ApiDeployment[];
}

export interface ApiActivityProject {
  id: string;
  name: string;
}

export interface ApiActivityBranch {
  id: string;
  name: string;
}

export interface ApiActivityCommit extends MinardCommit {
  hash: string;
}

export interface ApiActivity {
  type: 'activity';
  activityType: string;
  id: string;
  timestamp: string;
  deployment: ApiDeployment;
  project: ApiActivityProject;
  branch: ApiActivityBranch;
  commit: ApiActivityCommit;
}

export type ApiEntity = ApiActivity | ApiProject | ApiCommit | ApiDeployment | ApiBranch;
export type ApiEntities = ApiActivity[] | ApiProject[] | ApiCommit[] | ApiDeployment[] | ApiBranch[];
