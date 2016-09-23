
import { injectable } from 'inversify';

import {
  MinardDeployment,
} from '../deployment';

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
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
      body: JSON.stringify(body),
    };

    let ret = await fetch(url, options);
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
