
import { MinardDeployment } from '../deployment';
import { MinardCommit } from '../project';

import * as moment from 'moment';

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
  id?: number;
  timestamp: moment.Moment;
  activityType: string;
  teamId: number;
  projectId: number;
  projectName: string;
  branch: string;
}
