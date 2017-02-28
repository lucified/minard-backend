
import { inject, injectable } from 'inversify';

import { truncate } from 'lodash';

import {
  MinardDeployment,
} from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';

import {
  NotificationComment,
} from './types';

export function getMessageWithScreenshot(
  deployment: MinardDeployment,
  projectUrl: string,
  previewUrl: string,
  comment?: NotificationComment) {
  const imgStyle = 'height: 100px; border: 1px solid #d8d8d8;';
  return `
    <table style="background-color: white; border: 1px solid #d8d8d8;">
      <tr>
        <td>
          <a href='${previewUrl}'>
            <img
              src='${deployment.screenshot}'
              style='${imgStyle}'/>
          </a>
        </td>
        <td>
          ${getBasicMessage(deployment, projectUrl, previewUrl, comment)}
        </td>
      </tr>
    </table>`;
}

export function getBasicMessage(
  deployment: MinardDeployment, projectUrl: string, previewUrl: string, comment?: NotificationComment) {
  return `
    <table>
      <tr>
        <td>
          <img height="81" width="1" src='https://upload.wikimedia.org/wikipedia/commons/5/52/Spacer.gif' />
          ${getDescription(deployment, projectUrl, previewUrl, comment)}
        </td>
      <tr>
    </table>
  `;
}

export function getDescription(
  deployment: MinardDeployment, projectUrl: string, previewUrl: string, comment?: NotificationComment) {
  if (comment) {
    const name = comment.name || comment.email;
    return `<b>${name}</b> added a new comment: <i>${comment.message}</i>`;
  }

  const message = truncate(deployment.commit.message.split('\n')[0], { length: 50 });
  let ret = `<b>${deployment.commit.committer.name}</b> generated ` +
    `a new <a href="${previewUrl}">preview</a> ` +
    `in <b><a href="${projectUrl}">${deployment.projectName}</a></b>.`;
  if (message && message.length > 0) {
    ret += ` <i>${message}</i>`;
  }
  return ret;
}

@injectable()
export class HipchatNotify {

  public static injectSymbol = Symbol('hipchat-notify');
  private fetch: IFetch;

  public constructor(@inject(fetchInjectSymbol) fetch: IFetch) {
    this.fetch = fetch;
  }

  private getCard(deployment: MinardDeployment, projectUrl: string, previewUrl: string, comment?: NotificationComment) {
    // we need this hack to show proper screenshot in integration
    // tests, as thumbnails served via localhost will crash the
    // hipchat android app
    if (deployment.projectName === 'integration-test-project') {
      deployment.screenshot = 'http://www.lucify.com/images/lucify-asylum-countries-open-graph-size-5adef1be36.png';
    }

    // do not include thumbnail if screenshot url points to
    // localhost, as this will crash the hipchat mobile app
    const thumbnail = deployment.screenshot && deployment.screenshot.indexOf('//localhost') === -1 ? {
      url: deployment.screenshot,
      width: 1200,
      height: 750,
    } : undefined;

    return {
      id: `minard-deployment-${deployment.id}`,
      style: 'link',
      url: previewUrl,
      title: `${deployment.projectName}`,
      description: {
        value: getDescription(deployment, projectUrl, previewUrl, comment),
        format: 'html',
      },
      icon: {
        url: 'https://minard.io/favicon-32x32.png',
        'url@2x': 'https://minard.io/favicon-128x128.png',
      },
      thumbnail,
    };
  }

  public async notify(
    deployment: MinardDeployment,
    roomId: number,
    authToken: string,
    projectUrl: string,
    _branchUrl: string,
    previewUrl: string,
    commentUrl: string | undefined,
    comment: NotificationComment | undefined,
    ): Promise<any> {

    const status = deployment.status;

    // do not send notification for failed deployments
    if (status !== 'success') {
      return;
    }

    const url = `https://api.hipchat.com/v2/room/${roomId}/notification?auth_token=${authToken}`;

    const fullPreviewUrl = commentUrl || previewUrl;

    // this is only used for clients that don't support the card
    const message = deployment.screenshot ? getMessageWithScreenshot(deployment, projectUrl, fullPreviewUrl, comment)
      : getBasicMessage(deployment, projectUrl, fullPreviewUrl, comment);

    const body = {
      color: 'green',
      notify: false,
      message_format: 'html',
      message,
      card: this.getCard(deployment, projectUrl, fullPreviewUrl, comment),
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
      body: JSON.stringify(body),
    };

    const ret = await this.fetch(url, options);
    if (ret.status === 202 || ret.status === 200 || ret.status === 201 || ret.status === 204) {
      return;
    }

    try {
      const json = await ret.json();
      throw Error(
        `Unexpected status ${ret.status} when posting HipChat notification. ` +
        `Response was ${JSON.stringify(json, null, 2)}`);
    } catch (error) {
      throw Error(`Unexpected status ${ret.status} when posting HipChat notification.`);
    }
  }
}
