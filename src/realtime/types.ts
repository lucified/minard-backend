
import {
  JsonApiEntity,
} from '../json-api/types';

export interface StreamingCodePushedEvent {
  teamId: number;
  after?: string;
  before?: string;
  commits: JsonApiEntity[];
  parents: string[];
  branch: JsonApiEntity | string;
  project: string;
}

export interface StreamingDeploymentEvent {
  teamId: number;
  deployment: JsonApiEntity;
  commit: string;
  project: string;
  branch: string;
}

export interface StreamingCommentDeletedEvent {
  teamId: number;
  comment: string;
  deployment: string;
}
