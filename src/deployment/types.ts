import { Moment } from 'moment';

import { eventCreator } from '../shared/events';
import { BuildStatus } from '../shared/gitlab';
import { MinardCommit } from '../shared/minard-commit';

export const deploymentUrlPatternInjectSymbol = Symbol(
  'deployment-url-pattern',
);

export interface DeploymentStatusUpdate {
  buildStatus?: MinardDeploymentStatus;
  extractionStatus?: MinardDeploymentStatus;
  screenshotStatus?: MinardDeploymentStatus;
  status?: MinardDeploymentStatus;
}

export interface BuildStatusEvent {
  readonly deploymentId: number;
  readonly status: BuildStatus;
}

export interface DeploymentEvent {
  readonly teamId: number;
  readonly statusUpdate: DeploymentStatusUpdate;
  readonly deployment: MinardDeployment;
}

export const BUILD_STATUS_EVENT_TYPE = 'BUILD_STATUS_EVENT';
export const createBuildStatusEvent = eventCreator<BuildStatusEvent>(
  BUILD_STATUS_EVENT_TYPE,
);

export const DEPLOYMENT_EVENT_TYPE = 'DEPLOYMENT_UPDATED';
export const createDeploymentEvent = eventCreator<DeploymentEvent>(
  DEPLOYMENT_EVENT_TYPE,
);

export const BUILD_CREATED_EVENT = 'BUILD_CREATED_EVENT';
export const createBuildCreatedEvent = eventCreator<BuildCreatedEvent>(
  BUILD_CREATED_EVENT,
);

export interface DeploymentKey {
  projectId: number;
  deploymentId: number;
}

export type MinardDeploymentStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled';

export interface MinardDeploymentCreator {
  name: string;
  email: string;
  timestamp: string;
}

interface PlainDeployment {
  id: number;
  commitHash: string;
  ref: string;
  buildStatus: MinardDeploymentStatus;
  extractionStatus: MinardDeploymentStatus;
  screenshotStatus: MinardDeploymentStatus;
  status: MinardDeploymentStatus;
  projectId: number;
  projectName: string;
  teamId: number;
}

export interface DbDeployment extends PlainDeployment {
  commit: string | MinardCommit; // type depends on the DB driver
  finishedAt?: number | string; // type depends on the DB driver
  createdAt: number | string; // type depends on the DB driver
}

export interface MinardDeployment extends PlainDeployment {
  commit: MinardCommit;
  url?: string;
  screenshot?: string;
  finishedAt?: Moment;
  createdAt: Moment;
  creator?: MinardDeploymentCreator;
}

export interface MinardJsonBuildCommand {
  name?: string;
  command: string;
}

export interface MinardJsonBuild {
  commands:
    | MinardJsonBuildCommand[]
    | string[]
    | MinardJsonBuildCommand
    | string;
  image?: string;
  variables?: {
    [key: string]: string;
  };
  cache?: any;
}

export interface MinardJson {
  publicRoot?: string;
  build?: MinardJsonBuild;
}

export interface MinardJsonInfo {
  errors: string[];
  parsed?: any;
  effective?: MinardJson;
  content?: string;
}

// gitlab-ci.yml represented as json
export interface GitlabSpec {
  image: string;
  build: {
    script: string[];
    when?: string;
    variables?: { [key: string]: string };
    artifacts?: {
      name: string;
      paths: string[];
    };
  };
  cache?: {
    paths: string[];
  };
}

export interface RepositoryObject {
  id: string;
  name: string;
  type: string;
  mode: string;
}

export interface BuildCreatedEvent {
  id: number;
  ref: string;
  tag: boolean;
  sha: string;
  status: BuildStatus;
  name: string;
  token: string;
  stage: string;
  project_id: number;
  project_name: string;
  commands: string;
  repo_url: string;
  before_sha: string;
  allow_git_fetch: boolean;
  options: any;
}
