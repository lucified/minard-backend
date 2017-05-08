import * as gravatar from 'gravatar';
import { inject, injectable } from 'inversify';
import { RequestInit } from 'node-fetch';

import objectToFormData from './object-to-form-data';

import {
  NotificationComment,
} from './types';

import {
  MinardDeployment,
  MinardDeploymentStatus,
} from '../deployment';

import { IFetch } from '../shared/fetch';
import { fetchInjectSymbol } from '../shared/types';

interface ThreadField {
  label: string;
  value: string;
}

const url = 'https://api.flowdock.com/messages';

@injectable()
export class FlowdockNotify {

  public static injectSymbol = Symbol('flowdock-notify');

  public constructor(@inject(fetchInjectSymbol) private fetch: IFetch) { }

  public getBody(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string,
    previewUrl: string,
    commentUrl: string | undefined,
    comment: NotificationComment | undefined,
  ) {
    const state = deployment.status;
    const body = {
      flow_token: flowToken,
      event: comment ? 'discussion' : 'activity',
      external_thread_id: this.flowdockThreadId(deployment),
      tags: this.tags(deployment, state, comment),
      thread: this.threadData(deployment, projectUrl, branchUrl, previewUrl, comment),
      title: comment ? `<a href="${commentUrl}">commented</a>` : this.messageTitle(deployment, comment),
      author: this.author(deployment, comment),
      body: comment ? comment.message : this.threadBody(deployment, comment),
    };
    return body;
  }

  public notify(
    deployment: MinardDeployment,
    flowToken: string,
    projectUrl: string,
    branchUrl: string,
    previewUrl: string,
    commentUrl: string | undefined,
    comment: NotificationComment | undefined,
  ): Promise<void> {
    const body = this.getBody(deployment, flowToken, projectUrl, branchUrl, previewUrl, commentUrl, comment);
    const fields = body.thread.fields;

    delete body.thread.fields;
    const form = objectToFormData(body);

    // Map fields to form data manually to make this work with
    // Flowdock's approach for representing arrays in form-data
    fields.forEach((item: { label: string, value: string}) => {
      form.append('thread[fields][][label]', item.label);
      form.append('thread[fields][][value]', item.value);
    });

    if (deployment.screenshot && !comment) {
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
    // We need to cast here since fetch expects the type of the body to be the
    // globally defined FormData which doesn't exist in node
    return this.doFetch(options as any);
  }

  private async doFetch(options: RequestInit) {
    const ret = await this.fetch(url, options);
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

  private tags(deployment: MinardDeployment, state: string, comment?: NotificationComment) {
    return comment ? '' : [deployment.projectName, deployment.ref, 'minard', 'preview', state].join(',');
  }

  private author(deployment: MinardDeployment, comment?: NotificationComment) {
    if (comment) {
      return {
        name: comment.name ? comment.name : comment.email,
        email: comment.email,
        avatar: gravatar.url(comment.email),
      };
    }
    return {
      name: deployment.commit.committer.name,
      email: deployment.commit.committer.email,
      avatar: gravatar.url(deployment.commit.committer.email),
    };
  }

  private flowdockThreadId(deployment: MinardDeployment) {
    return `minard:deployment:${deployment.projectId}:${deployment.id}`;
  }

  private threadTitle(deployment: MinardDeployment) {
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

  private threadBody(deployment: MinardDeployment, comment?: NotificationComment): string {
    if (comment) {
      return comment.message;
    }
    return `<p style="font-family: monospace">${deployment.commit.message}</p>`;
  }

  private threadData(
    deployment: MinardDeployment,
    projectUrl: string,
    branchUrl: string,
    previewUrl: string,
    _comment?: NotificationComment,
  ) {
    const state = deployment.status;
    return {
      title: this.threadTitle(deployment),
      body: this.threadBody(deployment),
      external_url: deployment.status === 'success' ? previewUrl : projectUrl,
      status: {
        value: state,
        color: this.threadStatusColor(state),
      },
      fields: this.threadFields(deployment, projectUrl, branchUrl, previewUrl),
    };
  }

  private messageTitle(deployment: MinardDeployment, comment?: NotificationComment) {
    return comment ? comment.message : this.threadTitle(deployment);
  }

  private threadFields(
    deployment: MinardDeployment,
    projectUrl: string,
    branchUrl: string,
    previewUrl: string,
  ): ThreadField[] {
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
        label: 'Deployment',
        value: `<a href="${deployment.url}">${deployment.url}</a>`,
      });
    }

    if (previewUrl) {
      fields.push({
        label: 'Preview',
        value: `<a href="${previewUrl}">${previewUrl}</a>`,
      });
    }

    return fields;
  }
}
