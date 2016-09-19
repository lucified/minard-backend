
import {
  JsonApiEntity,
} from '../json-api/types';

export interface StreamingCodePushedEvent {
  after?: string;
  before?: string;
  commits: JsonApiEntity[];
  parents: string[];
  branch: JsonApiEntity | string;
  project: string;
}
