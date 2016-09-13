
export interface GitlabPushEventProject {
  name: string;
  description: string;
  web_url: string;
  avatar_url?: any;
  git_ssh_url: string;
  git_http_url: string;
  namespace: string;
  visibility_level: number;
  path_with_namespace: string;
  default_branch: string;
  homepage: string;
  url: string;
  ssh_url: string;
  http_url: string;
}

export interface GitlabPushEventRepository {
  name: string;
  url: string;
  description: string;
  homepage: string;
  git_http_url: string;
  git_ssh_url: string;
  visibility_level: number;
}

export interface GitlabPushEventAuthor {
  name: string;
  email: string;
}

export interface GitlabPushEventCommit {
  id: string;
  message: string;
  timestamp: Date;
  url: string;
  author: GitlabPushEventAuthor;
  added: string[];
  modified: string[];
  removed: any[];
}

export interface GitlabPushEvent {
  object_kind: string;
  before: string;
  after: string;
  ref: string;
  checkout_sha: string;
  user_id: number;
  user_name: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: GitlabPushEventProject;
  repository: GitlabPushEventRepository;
  commits: GitlabPushEventCommit[];
  total_commits_count: number;
}


