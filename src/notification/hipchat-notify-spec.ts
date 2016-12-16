
import { expect } from 'chai';
import 'reflect-metadata';

import {
  MinardDeployment,
} from '../deployment';

import {
  HipchatNotify,
} from './hipchat-notify';

import {
  NotificationComment,
} from './types';

import { fetchMock } from '../shared/fetch';

describe('hipchat-notify', () => {

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

  const deployment = baseDeployment;
  const authToken = 'fake-hipchat-auth-token';
  const roomId = 66;
  const projectUrl = 'http://foo-bar.com/projects/5';
  const branchUrl = 'http://foo-bar.com/branches/1-5';
  const previewUrl = 'http://foo-bar-ui.com/preview/1-5';

  function arrange(): { notifier: HipchatNotify, promise: Promise<any> } {
    const notifier = new HipchatNotify(fetchMock.fetchMock);
    const mockUrl = `https://api.hipchat.com/v2/room/${roomId}/notification?auth_token=${authToken}`;
    const promise = new Promise<any>((resolve, _reject) => {
      const response = (_url: string, options: any) => {
        resolve(options);
        return {};
      };
      fetchMock.restore().mock(mockUrl, response, { method: 'POST' });
    });
    return { notifier, promise };
  }

  it('should send correct notification for deployment with screenshot', async () => {
    // Arrange
    const { notifier, promise } = arrange();

    // Act
    await notifier.notify(deployment, roomId, authToken, projectUrl, branchUrl, previewUrl, undefined, undefined);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);
    expect(body.color).equal('green');
    expect(body.card.url).equals(previewUrl);

    // (just do some basic checks for message)
    expect(body.message).to.exist;
    expect(body.message).contains(deployment.projectName);
    expect(body.message).contains(projectUrl);
    expect(body.message).contains(previewUrl);
    expect(body.message).contains(deployment.screenshot!);
    expect(body.message).contains(deployment.commit.committer.name);
    return body;
  });

  it('should send correct notification for comment', async () => {
    // Arrange
    const commentUrl = 'http://foo-bar-ui.com/preview/1-5/comment/6';

    const { notifier, promise } = arrange();
    const comment: NotificationComment = {
      email: 'foo@foomail.com',
      name: 'foo woman',
      message: 'foo msg',
    };

    // Act
    await notifier.notify(deployment, roomId, authToken, projectUrl, branchUrl, previewUrl, commentUrl, comment);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);
    expect(body.color).equal('green');
    expect(body.card.description.value).equals(`<b>${comment.name}</b> added a new comment: <i>${comment.message}</i>`);
    expect(body.card.url).equals(commentUrl);

    // (just do some basic checks for message)
    expect(body.message).to.exist;
    expect(body.message).contains(comment.message);
    expect(body.message).contains(commentUrl);
    return body;
  });

});
