// Script for manually testing Slack notifications
// during development

import * as moment from 'moment';
import 'reflect-metadata';

import { MinardDeployment } from '../deployment';
import { fetch, IFetch } from '../shared/fetch';
import { SlackNotify } from './slack-notify';

// const screenshot = fs.readFileSync('mini-camel.jpg') as Buffer;

const slackNotify = new SlackNotify(fetch as IFetch);

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

const projectUrl = 'http://www.foo.com';
const branchUrl = 'http://www.bar.com';
const previewUrl = 'http://www.bar-ui.com/preview/5';
const commentUrl = 'http://www.bar-ui.com/preview/5/comment/45';

const deployment: MinardDeployment = {
  id: 10,
  teamId: 1,
  projectId: Math.round(Math.random() * 10000),
  status: 'success',
  ref: 'foo-branch',
  projectName: 'foo-project-name',
  url: 'http://foo-deployment-url.com',
  commitHash: 'abcdef12345',
  buildStatus: 'success',
  extractionStatus: 'success',
  screenshotStatus: 'failed',
  createdAt: moment(),
  commit: {
    id: 'foo-id',
    shortId: 'foo-id',
    message: 'foo',
    committer: {
      name: 'Ville Saarinen',
      email: 'ville.saarinen@lucify.com',
      timestamp: 'fake-timestamp',
    },
    author: {
      name: 'Ville Saarinen',
      email: 'ville.saarinen@lucify.com',
      timestamp: 'fake-timestamp',
    },
  },
};

const comment = {
  name: 'foo commenter',
  email: 'foo@gjoo.com',
  message: 'foo comment',
};

async function test() {
 await slackNotify.notify(
   deployment,
   slackWebhookUrl,
   projectUrl,
   branchUrl,
   previewUrl,
   undefined,
   undefined,
 );
 await slackNotify.notify(
   deployment,
   slackWebhookUrl,
   projectUrl,
   branchUrl,
   previewUrl,
   commentUrl,
   comment,
  );
}

test().catch(err => console.log(err));

