
import { eventCreator } from '../shared/events';

import { MinardDeployment } from '../deployment';
import { MinardCommit } from '../shared/minard-commit';

import * as moment from 'moment';

export interface MinardCommentActivity extends MinardActivity {
  activityType: 'comment';
  commentId: number;
  name?: string;
  email: string;
  message: string;
}

export interface MinardDeploymentActivity extends MinardActivity {
  activityType: 'deployment';
}

export function isCommentActivity(activity: any): activity is MinardCommentActivity {
  return (
    activity &&
    activity.deployment &&
    activity.teamId &&
    activity.projectId &&
    activity.activityType === 'comment'
  );
}

export interface MinardActivity {
  activityType: 'deployment' | 'comment';
  deployment: MinardDeployment;
  id?: number;
  timestamp: moment.Moment;
  teamId: number;
  projectId: number;
  projectName: string;
  branch: string;
  commit: MinardCommit;
  name?: string;
  email?: string;
  message?: string;
  commentId?: number;
}

export interface MinardActivityBranch {
  id: string;
  name: string;
}

export const NEW_ACTIVITY = 'NEW_ACTIVITY';
export const createActivityEvent =
  eventCreator<MinardActivity>(NEW_ACTIVITY);
