import CharlesClient from './charles-client';

export interface Auth0 {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}
export interface Config {
  charles: string;
  auth0: {
    regular: Auth0 & { gitPassword: string };
    open: Auth0 & { gitPassword: string };
    admin: Auth0 & { gitPassword: string };
    [key: string]: Auth0 & { gitPassword: string };
  };
  notifications?: NotificationConfigurations;
}

export interface NotificationConfigurations {
  flowdock?: FlowdockNotificationConfiguration;
  hipchat?: HipChatNotificationConfiguration;
  slack?: SlackNotificationConfiguration;
}
interface HipChatNotificationConfiguration {
  type: 'hipchat';
  hipchatRoomId: number;
  hipchatAuthToken: string;
}

interface FlowdockNotificationConfiguration {
  type: 'flowdock';
  flowToken: string;
}

interface SlackNotificationConfiguration {
  type: 'slack';
  slackWebhookUrl: string;
}

export interface SSE {
  type: string;
  lastEventId: string;
  data: any;
}

export type TeamType = 'admin' | 'regular' | 'open';
export interface CharlesClients {
  admin: CharlesClient;
  open: CharlesClient;
  regular: CharlesClient;
}
