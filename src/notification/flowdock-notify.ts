
import * as gravatar from 'gravatar';
import { inject, injectable } from 'inversify';

import objectToFormData from './object-to-form-data';

import {
  MinardDeployment,
  MinardDeploymentStatus,
} from '../deployment';
import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';

type ThreadField = { label: string, value: string };

const url = 'https://api.flowdock.com/messages';

@injectable()
export class FlowdockNotify {

  public static injectSymbol = Symbol('flowdock-notify');

  private fetch: IFetch;

  public constructor(@inject(fetchInjectSymbol) fetch: IFetch) {
    this.fetch = fetch;
  }

  public getBody(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string) {
    const state = deployment.status;
    const body = {
      flow_token: flowToken,
      event: 'activity',
      external_thread_id: this.flowdockThreadId(deployment),
      tags: [deployment.projectName, deployment.ref, 'minard', 'preview', state].join(','),
      thread: this.threadData(deployment, projectUrl, branchUrl),
      title: this.activityTitle(deployment),
      author: {
        name: deployment.commit.committer.name,
        email: deployment.commit.committer.email,
        avatar: gravatar.url(deployment.commit.committer.email),
      },
      body: this.threadBody(deployment),
    };
    return body;
  }

  public async notify(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string): Promise<any> {

    const body = this.getBody(deployment, flowToken, projectUrl, branchUrl);
    const fields = body.thread.fields;

    delete body.thread.fields;
    const form = objectToFormData(body);

    // Map fields to form data manually to make this work with
    // Flowdock's approach for representing arrays in form-data
    fields.forEach(item => {
      form.append('thread[fields][][label]', item.label);
      form.append('thread[fields][][value]', item.value);
    });

    if (deployment.screenshot) {
      form.append('attachments[screenshot]', deployment.screenshot, 'screenshot.jpg');
    }

    const options = {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'request',
        'X-flowdock-wait-for-message': 'true',
      },
      body: form,
    };
    return this.doFetch(options);
  }

  private async doFetch(options: any) {
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
    return `<p style="font-family: monospace">${deployment.commit.message}</p>`;
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
