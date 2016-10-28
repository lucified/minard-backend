
import { inject, injectable } from 'inversify';

import { truncate } from 'lodash';

import {
  MinardDeployment,
} from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';

export function getMessageWithScreenshot(deployment: MinardDeployment, projectUrl: string, branchUrl: string) {
  const imgStyle = 'height: 100px; border: 1px solid #d8d8d8;';
  return `
    <table style="background-color: white; border: 1px solid #d8d8d8;">
      <tr>
        <td>
          <a href='${deployment.url}'>
            <img
              src='${deployment.screenshot}'
              style='${imgStyle}'/>
          </a>
        </td>
        <td>
          ${getBasicMessage(deployment, projectUrl, branchUrl)}
        </td>
      </tr>
    </table>`;
}

export function getBasicMessage(deployment: MinardDeployment, projectUrl: string, branchUrl: string) {
  return `
    <table>
      <tr>
        <td>
          <img height="27" width="1" src='https://upload.wikimedia.org/wikipedia/commons/5/52/Spacer.gif' />
          <b>${deployment.commit.committer.name}</b> generated preview
          <a href='${deployment.url}'><code>${deployment.commit.shortId}</code></a>
          in
          <a href='${branchUrl}'>${deployment.ref}</a>
          in <a href='${projectUrl}'>${deployment.projectName}</a>
        </td>
      <tr>
      <tr>
        <td>
          <img height="27" width="1" src='https://upload.wikimedia.org/wikipedia/commons/5/52/Spacer.gif' />
          <code>${deployment.commit.message}</code>
        </td>
      </tr>
      <tr>
        <td>
          <img height="27" width="1" src='https://upload.wikimedia.org/wikipedia/commons/5/52/Spacer.gif' />
          <a href="${deployment.url}">Open preview</a>
        </td>
      </tr>
    </table>
  `;
}

interface CardAttribute {
  label: string;
  value?: {
    label?: string,
    icon?: {
      url: string,
    }
    style?: string,
  };
};

@injectable()
export class HipchatNotify {

  public static injectSymbol = Symbol('hipchat-notify');
  private fetch: IFetch;

  public constructor(@inject(fetchInjectSymbol) fetch: IFetch) {
    this.fetch = fetch;
  }

  public getCard(deployment: MinardDeployment, projectUrl: string) {
    const message = truncate(deployment.commit.message.split('\n')[0], { length: 50 });
    let descriptionValue = `<b>${deployment.commit.committer.name}</b> generated ` +
      `a new <a href="${deployment.url}">preview</a> ` +
      `in <b><a href="${projectUrl}">${deployment.projectName}</a></b>.`;

    if (message && message.length > 0) {
      descriptionValue += ` <i>${message}</i>`;
    }

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
      url: deployment.url,
      title: `${deployment.projectName}`,
      description: {
        value: descriptionValue,
        format: 'html',
      },
      icon: {
        url: 'https://www.lucify.com/minard/minard-favicon.png',
        'url@2x': 'https://www.lucify.com/minard/minard-favicon.png',
      },
      thumbnail,
    };
  }

  public async notify(
    deployment: MinardDeployment,
    roomId: number,
    authToken: string,
    projectUrl: string,
    branchUrl: string): Promise<any> {

    const status = deployment.status;

    // do not send notification for failed deployments
    if (status !== 'success') {
      return;
    }

    const url = `https://api.hipchat.com/v2/room/${roomId}/notification?auth_token=${authToken}`;

    const message = deployment.screenshot ? getMessageWithScreenshot(deployment, projectUrl, branchUrl)
      : getBasicMessage(deployment, projectUrl, branchUrl);

    const body = {
      color: 'green',
      notify: false,
      message_format: 'html',
      message,
      card: this.getCard(deployment, projectUrl),
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
      body: JSON.stringify(body),
    };

    let ret = await this.fetch(url, options);
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
