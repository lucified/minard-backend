import { expect } from 'chai';
import * as fetchMock from 'fetch-mock';
import * as moment from 'moment';
import 'reflect-metadata';

import { MinardDeployment } from '../deployment';
import { SlackNotify } from './slack-notify';
import { NotificationComment } from './types';

describe('slack-notify', () => {
  const baseDeployment: MinardDeployment = {
    id: 10,
    teamId: 1,
    projectId: 3,
    status: 'success',
    ref: 'foo-branch',
    projectName: 'foo-project-name',
    url: 'http://foo-deployment-url.com',
    commitHash: 'abcdef12345',
    buildStatus: 'success',
    extractionStatus: 'success',
    screenshotStatus: 'failed',
    screenshot: 'http://foo-deployentm.com/screenshot.jpg',
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

  const deployment = baseDeployment;
  const slackWebhookUrl = 'https://hooks.slack.com/services/FAKE/SLACK/WEBHOOKURL';
  const projectUrl = 'http://foo-bar.com/projects/5';
  const branchUrl = 'http://foo-bar.com/branches/1-5';
  const previewUrl = 'http://foo-bar-ui.com/preview/1-5';

  function arrange(): { notifier: SlackNotify, promise: Promise<any> } {
    const notifier = new SlackNotify((fetchMock as any).fetchMock);
    const promise = new Promise<any>((resolve, _reject) => {
      const response = (_url: string, options: any) => {
        resolve(options);
        return {};
      };
      fetchMock.restore().mock(slackWebhookUrl, response, { method: 'POST' });
    });
    return { notifier, promise };
  }

  it('should send correct notification for deployment with screenshot', async () => {
    // Arrange
    const { notifier, promise } = arrange();

    // Act
    await notifier.notify(deployment, slackWebhookUrl, projectUrl, branchUrl, previewUrl, undefined, undefined);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);

    expect(body.attachments).to.exist;

    const attachment = body.attachments[0];

    expect(attachment).to.exist;
    expect(attachment.fallback).contains(previewUrl);
    expect(attachment.fallback).contains('preview');
    expect(attachment.color).equal('#40C1AC');
    expect(attachment.author_name).equal(deployment.commit.committer.name);
    expect(attachment.title).equal('New preview');
    expect(attachment.title_link).equal(previewUrl);
    expect(attachment.image_url).equal(deployment.screenshot);
    expect(attachment.ts).equal(deployment.createdAt.unix());
  });

  it('should send correct notification for comment', async () => {
    // Arrange
    const { notifier, promise } = arrange();
    const commentUrl = 'http://foo-bar-ui.com/preview/1-5/comment/6';
    const comment: NotificationComment = {
      email: 'foo@foomail.com',
      name: 'foo woman',
      message: 'foo msg',
    };

    // Act
    await notifier.notify(deployment, slackWebhookUrl, projectUrl, branchUrl, previewUrl, commentUrl, comment);

    // Assert
    const options = await promise;
    const body = JSON.parse(options.body);
    expect(body.attachments).to.exist;

    const attachment = body.attachments[0];

    expect(attachment).to.exist;
    expect(attachment.fallback).contains(commentUrl);
    expect(attachment.fallback).contains('comment');
    expect(attachment.color).equal('#40C1AC');
    expect(attachment.author_name).equal(comment.name);
    expect(attachment.title).equal('New comment');
    expect(attachment.title_link).equal(commentUrl);
    expect(attachment.image_url).equal(deployment.screenshot);
    // TODO: check timestamp?
  });

});
