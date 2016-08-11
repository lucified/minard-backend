
import { MinardDeployment } from '../deployment';
import { MinardBranch, MinardProject } from '../project';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
  project: MinardProject;
  branch: MinardBranch;
}

export interface MinardActivityPlain {
  timestamp: string;
  activityType: string;
}
