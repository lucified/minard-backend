import * as gravatar from 'gravatar';
import { inject, injectable } from 'inversify';

import { MinardDeployment } from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';
import { NotificationComment, SlackMessage } from './types';

export function getMessage(
  deployment: MinardDeployment,
  previewUrl: string,
  projectUrl: string,
  branchUrl: string,
  comment?: NotificationComment,
): SlackMessage {
  const author = comment || deployment.commit.author;
  const fallback = `New ${comment ? 'comment' : 'preview'} in ` +
    `${deployment.projectName}/${deployment.ref}: ${previewUrl}`;

  return {
    attachments: [
      {
        fallback,
        color: '#40C1AC',
        author_name: author.name,
        author_icon: gravatar.url(author.email),
        title: comment ? 'New comment' : 'New preview',
        title_link: previewUrl,
        text: comment ? comment.message : deployment.commit.message,
        fields: [
          {
            title: 'Project',
            value: `<${projectUrl}|${deployment.projectName}>`,
            short: true,
          },
          {
            title: 'Branch',
            value: `<${branchUrl}|${deployment.ref}>`,
            short: true,
          },
        ],
        image_url: deployment.screenshot,
        footer_icon: 'https://minard.io/favicon-16x16.png',
        // TODO: Can a comment's timestamp be fetched from somewhere?
        ts: comment ? Date.now() / 1000 : deployment.createdAt.unix(),
      },
    ],
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
    projectUrl: string,
    branchUrl: string,
    previewUrl: string,
    commentUrl?: string,
    comment?: NotificationComment,
  ): Promise<any> {
    // do not send notification for failed deployments
    if (deployment.status !== 'success') {
      return;
    }

    const fullPreviewUrl = commentUrl || previewUrl;
    const body = getMessage(deployment, fullPreviewUrl, projectUrl, branchUrl, comment);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
      body: JSON.stringify(body),
    };

    const ret = await this.fetch(webhookUrl, options);
    if (ret.status === 202 || ret.status === 200 || ret.status === 201 || ret.status === 204) {
      return;
    }

    try {
      const json = await ret.json();
      throw Error(
        `Unexpected status ${ret.status} when posting Slack notification. ` +
        `Response was ${JSON.stringify(json, null, 2)}`,
      );
    } catch (error) {
      throw Error(`Unexpected status ${ret.status} when posting Slack notification.`);
    }
  }
}
