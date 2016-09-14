import { eventCreator } from '../shared/events';
import { Deployment, DeploymentStatus } from '../shared/gitlab';

export const deploymentUrlPatternInjectSymbol = Symbol('deployment-url-pattern');

export type Deployment = Deployment;
export type DeploymentStatus = DeploymentStatus;

export interface DeploymentEvent {
  readonly id: number;
  readonly status: DeploymentStatus;
  readonly projectId?: number;
}

export const DEPLOYMENT_EVENT_TYPE = 'DEPLOYMENT_EVENT_TYPE';
export const createDeploymentEvent =
  eventCreator<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE);

export interface DeploymentKey {
  projectId: number;
  deploymentId: number;
}

export interface MinardDeploymentPlain {
  ref: string;
  status: string;
  url?: string;
  finished_at: string;
  creator: MinardDeploymentCreator;
}

export interface MinardDeploymentCreator {
  name: string;
  email: string;
  timestamp: string;
}

export interface MinardDeployment extends MinardDeploymentPlain {
  id: number;
  commitRef: any;
}

export interface MinardJsonBuildCommand {
  name?: string;
  command: string;
}

export interface MinardJsonBuild {
  commands: MinardJsonBuildCommand[] | string[] | MinardJsonBuildCommand | string;
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
    script: string[],
    when?: string,
    variables?: {[key: string]: string}
    artifacts?: {
      name: string,
      paths: string[],
    };
  };
  cache?: {
    paths: string[],
  };
}

export interface RepositoryObject {
  id: string;
  name: string;
  type: string;
  mode: string;
}

export interface BuildCreated {
  id: number;
  ref: string;
  tag: boolean;
  sha: string;
  status: DeploymentStatus;
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
