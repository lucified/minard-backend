// Script for manually testing GitHub notifications
// during development
import * as moment from 'moment';
import fetch from 'node-fetch';
import 'reflect-metadata';
import { DeploymentEvent } from '../deployment/types';
import { Event } from '../shared/events';
import Logger from '../shared/logger';
import { GitHubNotify } from './github-notify';
import { GitHubNotificationConfiguration } from './types';

const logger = Logger(undefined, true);

const githubNotify = new GitHubNotify(
  fetch,
  logger,
);
const previewUrl = 'http://www.bar-ui.com/preview/5';

async function test() {
  const response = await githubNotify.notify(
    previewUrl,
    {
      type: 'DEPLOYMENT_UPDATED',
      created: moment(),
      payload: {
        statusUpdate: {
          status: 'success',
        },
        deployment: {
          ref: 'test-new-notifier',
        },
      },
    } as Event<DeploymentEvent>,
    {
      type: 'github',
      githubOwner: 'lucified',
      githubRepo: 'lucify-hello-world',
      githubInstallationId: 39422,
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    } as GitHubNotificationConfiguration,
  );
  console.log(response);
}

test().catch(err => console.log(err));
