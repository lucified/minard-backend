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
}

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
  status: string;
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
