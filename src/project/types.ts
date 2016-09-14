import { eventCreator } from '../shared/events';

export interface ProjectCreatedEvent {
  projectId: number;
  teamId: number;
  name: string;
  description?: string;
}

export interface ProjectDeletedEvent {
  projectId: number;
}

export interface ProjectEditedEvent {
  projectId: number;
  name?: string;
  description?: string;
}

export interface CodePushedEvent {
  projectId: number;
  ref: string;
  before: MinardCommit | null;
  after: MinardCommit | null;
  parents: (MinardCommit | null)[] | null;
  commits: (MinardCommit | null)[];
}

export const PROJECT_EDITED_EVENT_TYPE = 'PROJECT_EDITED';
export const projectEdited =
  eventCreator<ProjectEditedEvent>(PROJECT_EDITED_EVENT_TYPE);

export const PROJECT_CREATED_EVENT_TYPE = 'PROJECT_CREATED';
export const projectCreated =
  eventCreator<ProjectCreatedEvent>(PROJECT_CREATED_EVENT_TYPE);

export const PROJECT_DELETED_EVENT_TYPE = 'PROJECT_DELETED';
export const projectDeleted =
  eventCreator<ProjectDeletedEvent>(PROJECT_DELETED_EVENT_TYPE);

export const CODE_PUSHED_EVENT_TYPE = 'CODE_PUSHED';
export const codePushed =
  eventCreator<CodePushedEvent>(CODE_PUSHED_EVENT_TYPE);

export interface MinardProjectPlain {
  name: string;
  path: string;
  repoUrl: string;
  description: string;
  latestActivityTimestamp: string;
  activeCommitters: MinardProjectContributor[];
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
  parentIds?: string[];
}

export interface MinardBranch {
  project: number;
  name: string;
  latestActivityTimestamp: string;
  latestCommit: MinardCommit;
}

export interface MinardProjectContributor {
  name: string;
  email: string;
  commits?: number;
  additions?: number;
  deletions?: number;
}
