export type NotificationType = 'flowdock' | 'hipchat' | 'slack';

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

export interface BaseNotificationConfiguration {
  id?: number;
  projectId: number | null;
  teamId: number | null;
  type: NotificationType;
  [others: string]: any;
}

export type NotificationConfiguration =
  | HipChatNotificationConfiguration
  | FlowdockNotificationConfiguration
  | SlackNotificationConfiguration;

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
  fields: { title: string; value: string; short?: boolean }[];
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
