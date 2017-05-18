
export interface Auth0 {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

export interface Config {
  charles: string;
  notifications: {
    flowdock?: {
      type: 'flowdock';
      flowToken: string;
    },
    hipchat?: {
      type: 'hipchat';
      hipchatRoomId: number;
      hipchatAuthToken: string;
    },
    slack?: {
      type: 'slack';
      slackWebhookUrl: string;
    },
  };
  auth0: {
    regular: Auth0 & { gitPassword: string };
    open: Auth0 & { gitPassword: string };
    admin: Auth0 & { gitPassword: string };
    [key: string]: Auth0 & { gitPassword: string };
  };
}
