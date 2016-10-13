
import { inject, injectable } from 'inversify';

import {
  MinardDeployment,
  MinardDeploymentStatus,
} from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';

type ThreadField = { label: string, value: string };

@injectable()
export class FlowdockNotify {

  public static injectSymbol = Symbol('flowdock-notify');

  private fetch: IFetch;

  public constructor(@inject(fetchInjectSymbol) fetch: IFetch) {
    this.fetch = fetch;
  }

  public async getBody(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string) {
    const state = deployment.status;
    const body = {
      flow_token: flowToken,
      event: 'activity',
      external_thread_id: this.flowdockThreadId(deployment),
      tags: [deployment.projectName, deployment.ref, 'minard', 'preview', state],
      thread: this.threadData(deployment, projectUrl, branchUrl),
      title: this.activityTitle(deployment),
      author: {
        name: deployment.commit.committer.name,
        email: deployment.commit.committer.email,
        avatar: this.buildStatusAvatar(state),
        avatar: gravatar.url(deployment.commit.committer.email),
      },
    };

    return body;
  }

  public async notify(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string): Promise<any> {

    const url = `https://api.flowdock.com/messages`;
    const body = await this.getBody(deployment, flowToken, projectUrl, branchUrl);

    const options = {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'request',
        'X-flowdock-wait-for-message': 'true',
      },
      json: true,
      body: JSON.stringify(body),
    };

    let ret = await this.fetch(url, options);
    if (ret.status === 202 || ret.status === 200 || ret.status === 201) {
      return;
    }

    if (ret.status === 404) {
      // Flowdock responds with 404 if token is invalid
      throw Error('Flowdock responded 404 when posting notification. Token is probably invalid.');
    }

    try {
      const text = await ret.text();
      throw Error(
        `Unexpected status ${ret.status} when posting flowdock notification. ` +
        `Response was ${text}`);
    } catch (error) {
      throw Error(`Unexpected status ${ret.status} when posting flowdock notification.`);
    }
  }

  private flowdockThreadId(deployment: MinardDeployment) {
    return `minard:deployment:${deployment.projectId}:${deployment.id}`;
  }

  private activityTitle(deployment: MinardDeployment) {
    const fullName = `${deployment.projectName}/${deployment.ref}`;
    switch (deployment.status) {
      case 'success':
        return `Created preview for ${fullName}`;
      case 'failed':
      case 'canceled':
        return `Error creating preview for ${fullName}`;
      case 'running':
      case `pending`:
        return `Generating preview for ${fullName}`;
      default:
        return `Unknown deployment state, ${deployment.status}`;
    }
  }

  private threadStatusColor(state: MinardDeploymentStatus) {
    switch (state) {
      case 'success':
        return 'green';
      case 'failed':
      case 'canceled':
        return 'red';
      case `pending`:
      case `running`:
        return 'yellow';
      default:
        return 'red';
    }
  }

  private threadBody(deployment: MinardDeployment) {
    const style = `border: 1px solid #d8d8d8; border-radius: 3px; ` +
      `box-shadow: box-shadow: 0 6px 12px 0 rgba(0,0,0,.05); max-width: 100%`;
    if (deployment.screenshot) {
      return (
        `<div>
          <p style="font-family: monospace">${deployment.commit.message}</p>
          <img src="${deployment.screenshot}" style="${style}" />
        </div>`
      );
    }
    return deployment.commit.message;
  }

  private threadData(deployment: MinardDeployment, projectUrl: string, branchUrl: string) {
    const state = deployment.status;
    return {
      title: this.activityTitle(deployment),
      body: this.threadBody(deployment),
      external_url: deployment.status === 'success' ? deployment.url : projectUrl,
      status: {
        value: state,
        color: this.threadStatusColor(state),
      },
      fields: this.threadFields(deployment, projectUrl, branchUrl),
    };
  }

  private threadFields(deployment: MinardDeployment, projectUrl: string, branchUrl: string): ThreadField[] {
    const fields: ThreadField[] = [];

    fields.push({
      label: 'Created by',
      value: deployment.commit.committer.name,
    });

    if (projectUrl) {
      fields.push({
        label: 'Project',
        value: `<a href="${projectUrl}">${deployment.projectName}</a>`,
      });
    }

    if (branchUrl) {
      fields.push({
        label: 'Branch',
        value: `<a href="${branchUrl}">${deployment.ref}</a>`,
      });
    }

    if (deployment.url) {
      fields.push({
        label: 'Preview',
        value: `<a href="${deployment.url}">${deployment.url}</a>`,
      });
    }

    return fields;
  }
}
