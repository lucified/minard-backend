import { eventCreator } from '../shared/events';

export const PROJECT_CREATED_EVENT_TYPE = 'PROJECT_CREATED';
export const projectCreated =
  eventCreator<{projectId: number, pathWithNameSpace: string}>(PROJECT_CREATED_EVENT_TYPE);

export interface MinardProjectPlain {
  name: string;
  path: string;
  branches: MinardBranch[];
  activeCommitters: MinardCommitAuthor[];
}

export interface MinardProject extends MinardProjectPlain {
  id: number;
}

export interface MinardCommitAuthor {
  name: string;
  email: string;
  timestamp: string;
}

export interface MinardCommit {
  id: string;
  shortId?: string;
  message: string;
  author: MinardCommitAuthor;
  committer: MinardCommitAuthor;
}

export interface MinardBranch {
  name: string;
  commits: MinardCommit[];
}
