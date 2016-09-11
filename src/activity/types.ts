
import { MinardDeployment } from '../deployment';
import { MinardCommit } from '../project';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardActivityDeployment;
  commit: MinardCommit;
}

export interface MinardActivityBranch {
  id: string;
  name: string;
}

export interface MinardActivityDeployment extends MinardDeployment {
  screenshot?: string;
}

export interface MinardActivityPlain {
  timestamp: number;
  activityType: string;
  teamId: number;
  projectId: number;
  projectName: string;
  branch: string;
}
