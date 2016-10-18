
// Script for manually testing flowdock notifications

import * as fs from 'fs';
import 'reflect-metadata';

import { MinardDeployment } from '../deployment';
import { IFetch, fetch } from '../shared/fetch';
import { FlowdockNotify } from './flowdock-notify';

const data = fs.readFileSync('mini-camel.jpg') as Buffer;

const flowdockNotify = new FlowdockNotify(fetch as IFetch);

const flowToken = process.env.FLOWDOCK_FLOW_TOKEN;
const projectUrl = 'http://www.foo.com';
const branchUrl = 'http://www.bar.com';

const deployment: MinardDeployment = {
  id: 10,
  projectId: Math.round(Math.random() * 1000),
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
  screenshot: data,
} as any;

flowdockNotify.notify(deployment, flowToken, projectUrl, branchUrl)
  .catch(err => console.log(err));
