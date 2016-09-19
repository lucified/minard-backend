
import { eventCreator } from '../shared/events';

import { MinardDeployment } from '../deployment';
import { MinardCommit } from '../shared/minard-commit';

import * as moment from 'moment';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
  commit: MinardCommit;
}

export interface MinardActivityBranch {
  id: string;
  name: string;
}

export interface MinardActivityPlain {
  id?: number;
  timestamp: moment.Moment;
  activityType: 'deployment';
  teamId: number;
  projectId: number;
  projectName: string;
  branch: string;
}

export const NEW_ACTIVITY = 'NEW_ACTIVITY';
export const createActivityEvent =
  eventCreator<MinardActivity>(NEW_ACTIVITY);
