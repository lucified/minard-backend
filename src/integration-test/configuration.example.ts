import { Config } from './types';

const charles = 'http://localtest.me:8000';
const audience = charles;
const domain = 'https://myorganization-dev.eu.auth0.com';

const configuration: Config = {
  charles,
  notifications: {
    flowdock: {
      type: 'flowdock',
      flowToken: 'foo',
    },
    hipchat: {
      type: 'hipchat',
      hipchatRoomId: 123,
      hipchatAuthToken: 'foo',
    },
    slack: {
      type: 'slack',
      slackWebhookUrl: 'foo',
    },
  },
  auth0: {
    regular: {
      audience,
      domain,
      clientId: 'foo',
      clientSecret: 'foo',
    },
    open: {
      audience,
      domain,
      clientId: 'foo',
      clientSecret: 'foo',
    },
    admin: {
      audience,
      domain,
      clientId: 'foo',
      clientSecret: 'foo',
    },
  },
};

export default configuration;
