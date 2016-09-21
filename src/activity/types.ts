
import { eventCreator } from '../shared/events';

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
  activityType: 'deployment';
  teamId: number;
  projectId: number;
  projectName: string;
  branch: string;
}

export const NEW_ACTIVITY = 'NEW_ACTIVITY';
export const createActivityEvent =
  eventCreator<MinardActivity>(NEW_ACTIVITY);
