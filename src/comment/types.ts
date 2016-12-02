
import * as moment from 'moment';

import { eventCreator } from '../shared/events';

export interface NewMinardComment extends BaseComment {
}

export interface DbComment extends BaseComment {
  id: number;
  createdAt: number;
  status: 'n' | 'd'; // n = new, d = deleted
}

export interface MinardComment extends BaseComment {
  id: number;
  createdAt: moment.Moment;
}

export interface BaseComment {
  email: string;
  name?: string;
  message: string;
  teamId: number;
  projectId: number;
  deploymentId: number;
}

export const ADD_COMMENT_EVENT_TYPE = 'ADD_COMMENT';
export const createAddCommentEvent =
  eventCreator<AddCommentEvent>(ADD_COMMENT_EVENT_TYPE);

export interface AddCommentEvent extends MinardComment {
  teamId: number;
}

export const DELETE_COMMENT_EVENT_TYPE = 'DELETE_COMMENT';
export const createDeleteCommentEvent =
  eventCreator<DeleteCommentEvent>(DELETE_COMMENT_EVENT_TYPE);

export interface DeleteCommentEvent {
  teamId: number;
  commentId: number;
}
