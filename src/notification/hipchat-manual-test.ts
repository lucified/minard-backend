// Script for manually testing HipChat notifications
// during development

import 'reflect-metadata';

import { MinardDeployment } from '../deployment';
import { fetch, IFetch } from '../shared/fetch';
import { HipchatNotify } from './hipchat-notify';

// const screenshot = fs.readFileSync('mini-camel.jpg') as Buffer;

const hipchatNotify = new HipchatNotify(fetch as IFetch);

const hipchatRoomId = process.env.HIPCHAT_ROOM_ID ? process.env.HIPCHAT_ROOM_ID : 3140019;
const hipchatAuthToken = process.env.HIPCHAT_AUTH_TOKEN ? process.env.HIPCHAT_AUTH_TOKEN : undefined;

const projectUrl = 'http://www.foo.com';
const branchUrl = 'http://www.bar.com';
const previewUrl = 'http://www.bar-ui.com/preview/5';
const commentUrl = 'http://www.bar-ui.com/preview/5/comment/45';

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
 await hipchatNotify.notify(
   deployment,
   hipchatRoomId,
   hipchatAuthToken,
   projectUrl,
   branchUrl,
   previewUrl,
   undefined,
   undefined);
 await hipchatNotify.notify(
   deployment,
   hipchatRoomId,
   hipchatAuthToken,
   projectUrl,
   branchUrl,
   previewUrl,
   commentUrl,
   comment);
}

test().catch(err => console.log(err));
