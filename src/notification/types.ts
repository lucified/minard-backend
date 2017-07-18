export type NotificationType = 'flowdock' | 'hipchat' | 'slack' | 'github';

export interface HipChatNotificationConfiguration extends BaseNotificationConfiguration {
  type: 'hipchat';
  hipchatRoomId: number;
  hipchatAuthToken: string;
}

export interface FlowdockNotificationConfiguration extends BaseNotificationConfiguration {
  type: 'flowdock';
  flowToken: string;
}

export interface SlackNotificationConfiguration extends BaseNotificationConfiguration {
  type: 'slack';
  slackWebhookUrl: string;
}

export interface GitHubNotificationConfiguration extends BaseNotificationConfiguration {
  type: 'github';
  githubRepo: string;
  githubOwner: string;
  githubInstallationId: number;
  githubAppId: number;
  githubAppPrivateKey: string;
}

export interface BaseNotificationConfiguration {
  id?: number;
  projectId: number | null;
  teamId: number | null;
  type: NotificationType;
  // [others: string]: any;
}

export type NotificationConfiguration =
  | HipChatNotificationConfiguration
  | FlowdockNotificationConfiguration
  | SlackNotificationConfiguration
  | GitHubNotificationConfiguration;

export function isGitHubConfiguration(
  c: NotificationConfiguration | undefined,
): c is GitHubNotificationConfiguration {
  return !!(c && c.type === 'github');
}
export interface NotificationComment {
  name?: string;
  email: string;
  message: string;
}

export interface SlackMessage {
  attachments: SlackAttachment[];
}

export interface SlackAttachment {
  fallback: string; // Required plain-text summary of the attachment
  color?: string; // 'good', 'warning', 'danger', '#<hexcode>'
  pretext?: string; // Optional text that appears above the attachment block
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string; // "Optional text that appears within the attachment",
  fields?: { title: string; value: string; short?: boolean }[];
  // Large images will be resized to a maximum width of 400px or a maximum height of 500px,
  // while still maintaining the original aspect ratio.
  image_url?: string;
  // Should be 75x75px. Must be less than 500kb.
  thumb_url?: string;
  footer?: string;
  // Should be 16x16px
  footer_icon?: string;
  ts: number; // timestamp, integer, epoch time
}

export type GitHubDeploymentState =
  | 'pending'
  | 'success'
  | 'error'
  | 'inactive'
  | 'failure';

// https://developer.github.com/v3/repos/deployments/#create-a-deployment
export interface GitHubDeploymentOptions {
  task?: string; // Default: deploy
  auto_merge?: boolean; // Default: true
  required_contexts?: string[]; // Default: all unique contexts
  payload?: string; // Default: ''
  description?: string; // Default: ''
  transient_environment?: boolean; // Default: false
  production_environment?: boolean; // Default: environment === 'production' ? true : false
  environment?: string; // Default: production
}

export interface CreateDeploymentRequest extends GitHubDeploymentOptions {
  ref: string;
}

export interface CreateDeploymentResponse {
  url: string;
  id: string;
  sha: string;
  ref: string;
  task: string;
  payload: any;
  environment: string;
  description: string;
  creator: any;
  created_at: string;
  updated_at: string;
  statuses_url: string;
  repository_url: string;
}

export interface TokenResponse {
  token: string;
  expires_at: string;
  on_behalf_of: any;
}

export interface DeployResult { success: boolean; }

export interface UpdateDeploymentResponse {
  url: string;
  id: string;
  state: GitHubDeploymentState;
  creator: any;
  created_at: string;
  description: string;
  updated_at: string;
  target_url: string;
  deployment_url: string;
  repository_url: string;
}

export interface UpdateDeploymentRequest {
  state: GitHubDeploymentState;
  description?: string;
  log_url?: string;
  environment_url?: string;
  auto_inactive?: boolean;
}

export interface GitHubCredentials {
  integration_id: number;
  installation_id: number;
  key: string | Buffer;
}
