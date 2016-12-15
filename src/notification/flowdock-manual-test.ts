
// Script for manually testing flowdock notifications
// during development

import 'reflect-metadata';

import { MinardDeployment } from '../deployment';
import { fetch, IFetch } from '../shared/fetch';
import { FlowdockNotify } from './flowdock-notify';

// const screenshot = fs.readFileSync('mini-camel.jpg') as Buffer;

const flowdockNotify = new FlowdockNotify(fetch as IFetch);

const flowToken = process.env.FLOWDOCK_FLOW_TOKEN;
const projectUrl = 'http://www.foo.com';
const branchUrl = 'http://www.bar.com';

const deployment: MinardDeployment = {
  id: 10,
  projectId: Math.round(Math.random() * 10000),
  status: 'success',
  ref: 'foo-branch',
  projectName: 'foo-project-name',
  url: 'http://foo-deployment-url.com',
  commit: {
    id: 'foo-id',
    shortId: 'foo-id',
    message: 'foo',
    committer: {
      name: 'juhoojala',
      email: 'juho@lucify.com',
    },
  },
} as any;

const comment = {
  name: 'foo commenter',
  email: 'foo@gjoo.com',
  message: 'foo comment',
};

async function test() {
 await flowdockNotify.notify(deployment, flowToken, projectUrl, branchUrl);
 await flowdockNotify.notify(deployment, flowToken, projectUrl, branchUrl, comment);
}

test().catch(err => console.log(err));
