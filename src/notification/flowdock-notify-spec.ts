import { expect } from 'chai';
import * as fetchMock from 'fetch-mock';
import * as moment from 'moment';
import 'reflect-metadata';

import {
  MinardComment,
} from '../comment';

import {
  MinardDeployment,
} from '../deployment';

import {
  FlowdockNotify,
} from './flowdock-notify';

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

  const previewUrl = 'http://foo-bar-ui.com/preview/deployment/43/foobartoken';

  async function shouldSendCorrectNotification(
    deployment: MinardDeployment,
    title: string,
    commentUrl?: string,
    comment?: MinardComment,
  ) {
    // Arrange
    const flowToken = 'fake-flow-token';
    const projectUrl = 'http://foo-bar.com/projects/5';
    const branchUrl = 'http://foo-bar.com/branches/1-5';
    const notifier = new FlowdockNotify((fetchMock as any).fetchMock);

    const mockUrl = `https://api.flowdock.com/messages`;
    const promise = new Promise<any>((resolve, _reject) => {
      const response = (_url: string, options: any) => {
        resolve(options);
        return {};
      };
      fetchMock.restore().mock(mockUrl, response, { method: 'POST' });
    });

    // Act
    const body = notifier.getBody(deployment, flowToken, projectUrl, branchUrl, previewUrl, commentUrl, comment);
    notifier.notify(deployment, flowToken, projectUrl, branchUrl, previewUrl, commentUrl, comment);

    // Assert
    expect(body.flow_token).to.equal(flowToken);
    expect(body.external_thread_id).to.equal('minard:deployment:5:6');
    expect(body.title).to.equal(title);
    expect(body.thread.status.value).to.equal(deployment.status);

    const options = await promise;
    expect(options.method).to.equal('POST');
    return body;
  }

  it('should send correct notification for deployment with screenshot', async () => {
    const deployment = baseDeployment;
    const body = await shouldSendCorrectNotification(deployment,
      'Created preview for foo-project-name/foo-branch');
    expect(body.event).to.equal('activity');
    expect(body.thread.status.color).to.equal('green');
    expect(body.author.avatar).to.equal('//www.gravatar.com/avatar/79f0c978a0b5b6db64cb1484f3d05c74');
    expect(body.thread.external_url).to.equal(previewUrl);
    expect(body.author.name).to.equal(deployment.commit.committer.name);
    expect(body.author.email).to.equal(deployment.commit.committer.email);
    expect(body.thread.title).to.equal(body.title);
  });

  it('should send correct notification for succesful deployment with no screenshot', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined });
    const body = await shouldSendCorrectNotification(deployment,
      'Created preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('green');
    expect(body.thread.external_url).to.equal(previewUrl);
  });

  it('should send correct notification for running deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'running' });
    const body = await shouldSendCorrectNotification(deployment,
      'Generating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('yellow');
  });

  it('should send correct notification for pending deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'pending' });
    const body = await shouldSendCorrectNotification(deployment,
      'Generating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('yellow');
  });

  it('should send correct notification for failed deployment', async () => {
    const deployment = Object.assign({}, baseDeployment, { screenshot: undefined, status: 'failed' });
    const body = await shouldSendCorrectNotification(deployment,
      'Error creating preview for foo-project-name/foo-branch');
    expect(body.thread.status.color).to.equal('red');
  });

  it('should send correct notification for comment', async () => {
    const deployment = baseDeployment;
    const commentUrl = 'http://foo-bar-ui.com/preview/deployment/43/foobartoken/comment/5';
    const comment: MinardComment = {
      name: 'foo commenter',
      message: 'foo comment msg',
      createdAt: moment(),
      email: 'foo@foomail.com',
      deploymentId: 5,
      id: 5,
      projectId: 6,
      teamId: 9,
    };
    const body = await shouldSendCorrectNotification(
      deployment,
      `<a href="${commentUrl}">commented</a>`,
      commentUrl,
      comment);
    expect(body.event).to.equal('discussion');
    expect(body.thread.status.color).to.equal('green');
    expect(body.thread.external_url).to.equal(previewUrl);
    expect(body.body).to.equal(comment.message);
    expect(body.author.name).to.equal(comment.name);
    expect(body.author.email).to.equal(comment.email);
    expect(body.author.avatar).to.equal('//www.gravatar.com/avatar/861227e75daf58bebbe4801c806be963');
    expect(body.thread.title).to.equal('Created preview for foo-project-name/foo-branch');
  });
});
