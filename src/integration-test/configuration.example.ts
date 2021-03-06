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
      uiClientId: 'foo',
      nonInteractiveClientId: 'foo',
      nonInteractiveClientSecret: 'foo',
    },
    open: {
      audience,
      domain,
      uiClientId: 'foo',
      nonInteractiveClientId: 'foo',
      nonInteractiveClientSecret: 'foo',
    },
    admin: {
      audience,
      domain,
      uiClientId: 'foo',
      nonInteractiveClientId: 'foo',
      nonInteractiveClientSecret: 'foo',
    },
  },
};

export default configuration;
