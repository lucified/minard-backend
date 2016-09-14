// The following interfaces were converted
// from the Gitlab sample responsens with alm
// https://basarat.gitbooks.io/alm/content/features/json-to-dts.html

interface ArtifactsFile {
  filename: string;
  size: number;
}

interface Commit {
  author_email: string;
  author_name: string;
  created_at: string;
  id: string;
  message: string;
  short_id: string;
  title: string;
  committed_date?: string;
  authored_date?: string;
  // these exists in the example at
  // http://docs.gitlab.com/ce/api/branches.html
  committer_email?: string;
  committer_name?: string;
  parent_ids: string[];
}

export type DeploymentStatus = 'running' | 'success' | 'failed' | 'canceled' | 'extracted';

export interface Deployment {
  commit: Commit;
  coverage: string|null;
  created_at: string;
  artifacts_file: ArtifactsFile|null;
  finished_at: string;
  id: number;
  name: string;
  ref: string;
  runner: string|null;
  stage: string;
  started_at: string;
  status: DeploymentStatus;
  tag: boolean;
  user: User;
}

export interface User {
  avatar_url: string;
  bio: string|null;
  created_at: string;
  id: number;
  is_admin: boolean;
  linkedin: string;
  name: string;
  skype: string;
  state: string;
  twitter: string;
  username: string;
  web_url: string;
  website_url: string;
}

interface SystemHook {
  id: number;
  url: string;
  created_at: string;
}

export interface Owner {
    id: number;
    name: string;
    created_at: Date;
}

export interface Access {
  access_level: number;
  notification_level: number;
}

export interface Permissions {
  project_access: Access;
  group_access: Access;
}

export interface SharedWithGroup {
    group_id: number;
    group_name: string;
    group_access_level: number;
}

export interface Namespace {
    created_at: Date;
    description: string;
    id: number;
    name: string;
    owner_id: number;
    path: string;
    updated_at: Date;
}

export interface Project {
    id: number;
    description?: any;
    default_branch: string;
    public: boolean;
    visibility_level: number;
    ssh_url_to_repo: string;
    http_url_to_repo: string;
    web_url: string;
    tag_list: string[];
    owner: Owner;
    name: string;
    name_with_namespace: string;
    path: string;
    path_with_namespace: string;
    issues_enabled: boolean;
    open_issues_count: number;
    merge_requests_enabled: boolean;
    builds_enabled: boolean;
    wiki_enabled: boolean;
    snippets_enabled: boolean;
    container_registry_enabled: boolean;
    created_at: Date;
    last_activity_at: string;
    creator_id: number;
    namespace: Namespace;
    permissions: Permissions;
    archived: boolean;
    avatar_url: string;
    shared_runners_enabled: boolean;
    forks_count: number;
    star_count: number;
    runners_token: string;
    public_builds: boolean;
    shared_with_groups: SharedWithGroup[];
}

export interface Branch {
  name: string;
  protected: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  commit: Commit;
}

export interface ProjectHook {
  id: number;
  url: string;
  project_id: number;
  push_events: boolean;
  issues_events: boolean;
  merge_requests_events: boolean;
  tag_push_events: boolean;
  note_events: boolean;
  build_events: boolean;
  pipeline_events: boolean;
  wiki_page_events: boolean;
  enable_ssl_verification: boolean;
  created_at: string;
}
