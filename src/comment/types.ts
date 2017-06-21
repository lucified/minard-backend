import { Moment } from 'moment';

import { eventCreator } from '../shared/events';

export interface NewMinardComment extends BaseComment {}

export interface DbComment extends BaseComment {
  id: number;
  createdAt: number;
  status: 'n' | 'd'; // n = new, d = deleted
}

export interface MinardComment extends BaseComment {
  id: number;
  createdAt: Moment;
}

export interface BaseComment {
  email: string;
  name?: string;
  message: string;
  teamId: number;
  projectId: number;
  deploymentId: number;
}

export const COMMENT_ADDED_EVENT_TYPE = 'COMMENT_ADDED';
export const createCommentAddedEvent = eventCreator<CommentAddedEvent>(
  COMMENT_ADDED_EVENT_TYPE,
);

export interface CommentAddedEvent extends MinardComment {
  teamId: number;
}

export const COMMENT_DELETED_EVENT_TYPE = 'COMMENT_DELETED';
export const createCommentDeletedEvent = eventCreator<CommentDeletedEvent>(
  COMMENT_DELETED_EVENT_TYPE,
);

export interface CommentDeletedEvent {
  teamId: number;
  commentId: number;
  deploymentId: number;
  projectId: number;
}
