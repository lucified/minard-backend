export interface Auth0 {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}
export interface Config {
  charles: string;
  notifications: {
    flowdock?: FlowdockNotificationConfiguration,
    hipchat?: HipChatNotificationConfiguration,
    slack?: SlackNotificationConfiguration,
  };
  auth0: {
    regular: Auth0 & { gitPassword: string };
    open: Auth0 & { gitPassword: string };
    admin: Auth0 & { gitPassword: string };
    [key: string]: Auth0 & { gitPassword: string };
  };
}

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
  type: NotificationType;
}

export type NotificationConfiguration =
  HipChatNotificationConfiguration |
  FlowdockNotificationConfiguration |
  SlackNotificationConfiguration;

export interface SSE {
  type: string;
  lastEventId: string;
  data: any;
}
