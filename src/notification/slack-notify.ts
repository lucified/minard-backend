import { url as gravatarUrl } from 'gravatar';
import { inject, injectable } from 'inversify';

import { MinardDeployment } from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';
import { NotificationComment, SlackAttachment, SlackMessage } from './types';

function getMessage(
  deployment: MinardDeployment,
  previewUrl: string,
  comment?: NotificationComment,
): SlackMessage {
  const author = comment || deployment.commit.author;
  const fallback =
    `New ${comment ? 'comment' : 'preview'} in ` +
    `${deployment.projectName}/${deployment.ref}: ${previewUrl}`;
  const previewTitle =
    `New ${comment ? 'comment' : 'preview'} in ` +
    `${deployment.projectName}/${deployment.ref}`;

  const message: SlackAttachment = {
    fallback,
    color: '#40C1AC',
    author_name: author.name || author.email,
    author_icon: gravatarUrl(author.email, undefined, false),
    title: previewTitle,
    title_link: previewUrl,
    text: comment ? comment.message : deployment.commit.message,
    fields: comment
      ? [
          {
            title: 'Preview:',
            value: deployment.commit.message,
            short: false,
          },
        ]
      : undefined,
    // For some reason the footer icon doesn't work. It might require HTTP?
    footer_icon: 'https://minard.io/favicon-16x16.png',
    // TODO: Can a comment's timestamp be fetched from somewhere?
    ts: comment ? Date.now() / 1000 : deployment.createdAt.unix(),
  };

  return {
    attachments: [message],
  };
}

@injectable()
export class SlackNotify {
  public static injectSymbol = Symbol('slack-notify');
  private fetch: IFetch;

  public constructor(@inject(fetchInjectSymbol) fetch: IFetch) {
    this.fetch = fetch;
  }

  public async notify(
    deployment: MinardDeployment,
    webhookUrl: string,
    _projectUrl: string,
    _branchUrl: string,
    previewUrl: string,
    commentUrl?: string,
    comment?: NotificationComment,
  ): Promise<void> {
    // do not send notification for failed deployments
    if (deployment.status !== 'success') {
      return;
    }

    const fullPreviewUrl = commentUrl || previewUrl;
    const body = getMessage(
      deployment,
      fullPreviewUrl,
      comment,
    );

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
      body: JSON.stringify(body),
    };

    const ret = await this.fetch(webhookUrl, options);
    if (
      ret.status === 202 ||
      ret.status === 200 ||
      ret.status === 201 ||
      ret.status === 204
    ) {
      return;
    }

    try {
      const json = await ret.json();
      throw Error(
        `Unexpected status ${ret.status} when posting Slack notification. ` +
          `Response was ${JSON.stringify(json, null, 2)}`,
      );
    } catch (error) {
      throw Error(
        `Unexpected status ${ret.status} when posting Slack notification.`,
      );
    }
  }
}
