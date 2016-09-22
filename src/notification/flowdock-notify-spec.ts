
import { expect } from 'chai';
import 'reflect-metadata';

import {
  MinardDeployment,
} from '../deployment';

import {
  FlowdockNotify,
} from './flowdock-notify';

const fetchMock = require('fetch-mock');

describe('flowdock-notify', () => {

  const baseDeployment: MinardDeployment = {
    id: 6,
    projectId: 5,
    status: 'success',
    ref: 'foo-branch',
    projectName: 'foo-project-name',
    url: 'http://foo-deployment-url.com',
    commit: {
      message: 'foo',
      committer: {
        name: 'fooman',
        email: 'fooman@foomail.com',
      },
    },
    screenshot: 'http://foo-bar.com/screenshot/foo',
  } as any;

  async function shouldSendCorrectNotification(deployment: MinardDeployment, title: string) {
    // Arrange
    const flowToken = 'fake-flow-token';
    const projectUrl = 'http://foo-bar.com/projects/5';
    const branchUrl = 'http://foo-bar.com/branches/1-5';
    const notifier = new FlowdockNotify();

    const mockUrl = `https://api.flowdock.com/messages`;
    const promise = new Promise<any>((resolve, reject) => {
      const response = (url: string, options: any) => {
        resolve(options);
        return {};
      };
      fetchMock.restore().mock(mockUrl, response, { method: 'POST' });
    });

    // Act
    await notifier.notify(deployment, flowToken, projectUrl, branchUrl);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);
    expect(body.flow_token).to.equal(flowToken);
    expect(body.event).to.equal('activity');
    expect(body.external_thread_id).to.equal('minard:deployment:5:6');
    expect(body.title).to.equal(title);
    expect(body.author.name).to.equal(deployment.commit.committer.name);
    expect(body.author.email).to.equal(deployment.commit.committer.email);
    expect(body.thread.title).to.equal(title);
    expect(body.thread.status.value).to.equal(deployment.status);
    return body;
  }

  it('should send correct notification for deployment with screenshot', async () => {
    const deployment = baseDeployment;
    const body = await shouldSendCorrectNotification(deployment,
      'Created preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('green');
    expect(body.thread.body.indexOf(`<img src="${deployment.screenshot}"`) !== -1).to.be.true;
    expect(body.author.avatar).to.equal('https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png');
    expect(body.thread.external_url).to.equal(deployment.url);
  });

  it('should send correct notification for succesful deployment with no screenshot', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined });
    const body = await shouldSendCorrectNotification(deployment,
      'Created preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('green');
    expect(body.thread.body.indexOf(`<img src="${deployment.screenshot}"`) !== -1).to.be.false;
    expect(body.author.avatar).to.equal('https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png');
    expect(body.thread.external_url).to.equal(deployment.url);
  });

  it('should send correct notification for running deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'running' });
    const body = await shouldSendCorrectNotification(deployment,
      'Generating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('yellow');
    expect(body.author.avatar).to.equal('https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png');
  });

  it('should send correct notification for pending deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'pending' });
    const body = await shouldSendCorrectNotification(deployment,
      'Generating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('yellow');
    expect(body.author.avatar).to.equal('https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png');
  });

  it('should send correct notification for failed deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'failed' });
    const body = await shouldSendCorrectNotification(deployment,
      'Error creating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('red');
    expect(body.author.avatar).to.equal('https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_fail.png');
  });

});
