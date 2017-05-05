
import {
  MinardCommit,
} from '../shared/minard-commit';

import {
  MinardProjectPlain,
} from '../project/';

import {
  MinardDeploymentCreator,
  MinardDeploymentStatus,
} from '../deployment/';

import {
  BaseNotificationConfiguration,
} from '../notification';

export interface JsonApiEntity {
  type: 'commits' | 'deployments' | 'projects' | 'branches' | 'notifications';
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
  commentCount?: number;
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

export interface ApiActivityComment {
  name?: string;
  email: string;
  id: string;
  message: string;
}

export interface ApiActivity {
  type: 'activity';
  activityType: 'comment' | 'deployment';
  id: string;
  timestamp: string;
  deployment: ApiDeployment;
  project: ApiActivityProject;
  branch: ApiActivityBranch;
  commit: ApiActivityCommit;
  comment?: ApiActivityComment;
}

export interface ApiComment {
  email: string;
  name?: string;
  message: string;
  deployment: string;
  id?: number;
  createdAt: string;
  project: number;
}

export interface ApiNotificationConfiguration extends BaseNotificationConfiguration {}

export interface PreviewView {
  project: {
    id: string;
    name: string;
  };
  deployment: JsonApiEntity;
  commit: JsonApiEntity;
  branch: {
    id: string;
    name: string;
  };
  previousDeployment?: string; // previous deployment id in branch
  nextDeployment?: string;     // next deployment id in branch
}

export type ApiEntity =
  ApiActivity |
  ApiProject |
  ApiCommit |
  ApiDeployment |
  ApiBranch |
  ApiNotificationConfiguration |
  ApiComment;

export type ApiEntities = ApiEntity[];
