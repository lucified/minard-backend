
import { expect } from 'chai';
import 'reflect-metadata';

import {
  MinardDeployment,
} from '../deployment';

import {
  HipchatNotify,
} from './hipchat-notify';

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

  it('should send correct notification for deployment with screenshot', async () => {
    const deployment = baseDeployment;
    // Arrange
    const authToken = 'fake-hipchat-auth-token';
    const roomId = 66;
    const projectUrl = 'http://foo-bar.com/projects/5';
    const branchUrl = 'http://foo-bar.com/branches/1-5';
    const notifier = new HipchatNotify(fetchMock.fetchMock);

    const mockUrl = `https://api.hipchat.com/v2/room/${roomId}/notification?auth_token=${authToken}`;
    const promise = new Promise<any>((resolve, reject) => {
      const response = (url: string, options: any) => {
        resolve(options);
        return {};
      };
      fetchMock.restore().mock(mockUrl, response, { method: 'POST' });
    });

    // Act
    await notifier.notify(deployment, roomId, authToken, projectUrl, branchUrl);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);
    expect(body.color).equal('green');
    // (just do some basic checks for message)
    expect(body.message).to.exist;
    expect(body.message).contains(deployment.projectName);
    expect(body.message).contains(projectUrl);
    expect(body.message).contains(branchUrl);
    expect(body.message).contains(deployment.url!);
    expect(body.message).contains(deployment.screenshot!);
    expect(body.message).contains(deployment.commit.committer.name);
    return body;
  });

});
