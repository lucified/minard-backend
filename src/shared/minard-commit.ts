import { Commit } from './gitlab';

export interface MinardCommitAuthor {
  name: string;
  email: string;
  timestamp: string;
}

export interface MinardCommit {
  id: string;
  shortId: string;
  message: string;
  author: MinardCommitAuthor;
  committer: MinardCommitAuthor;
  parentIds?: string[];
}

export function toMinardCommit(gitlabCommit: Commit): MinardCommit {
  return {
    id: gitlabCommit.id,
    shortId: gitlabCommit.short_id,
    message: gitlabCommit.message,
    author: {
      email: gitlabCommit.author_email,
      name: gitlabCommit.author_name,
      timestamp: gitlabCommit.authored_date || gitlabCommit.created_at,
    },
    committer: {
      email: gitlabCommit.committer_email || gitlabCommit.author_email,
      name: gitlabCommit.committer_name || gitlabCommit.author_name,
      timestamp: gitlabCommit.committed_date || gitlabCommit.created_at,
    },
    parentIds: gitlabCommit.parent_ids,
  };
}
