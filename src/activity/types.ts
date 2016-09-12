
import { MinardDeployment } from '../deployment';
import { MinardCommit, MinardProject } from '../project';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
  project: MinardProject;
  branch: MinardActivityBranch;
  commit: MinardCommit;
}

export interface MinardActivityBranch {
  id: string;
  name: string;
}

export interface MinardActivityPlain {
  timestamp: string;
  activityType: string;
}
