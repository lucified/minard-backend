import { eventCreator } from '../shared/events';
import { Deployment, DeploymentStatus } from '../shared/gitlab';

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
  screenshot?: string;
  finished_at: string;
}

interface CommitRef {
  id: string;
}

export interface MinardDeployment extends MinardDeploymentPlain {
  id: number;
  commitRef: CommitRef;
}
