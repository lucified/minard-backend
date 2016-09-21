
import { injectable } from 'inversify';

import {
  MinardDeployment,
  MinardDeploymentStatus,
} from '../deployment';

type ThreadField = { label: string, value: string };

@injectable()
export class FlowdockNotify {

  public static injectSymbol = Symbol('flowdock-notify');

  public notify(deployment: MinardDeployment, flowToken: string, projectUrl: string, branchUrl: string): Promise<any> {
    const state = deployment.status;
    const url = `https://api.flowdock.com/messages`;
    const options = {
      method: 'POST',
      headers: {
        'User-Agent': 'request',
        'X-flowdock-wait-for-message': 'true',
      },
      json: true,
      body: JSON.stringify({
        flow_token: flowToken,
        event: 'activity',
        external_thread_id: this.flowdockThreadId(deployment),
        thread: this.threadData(deployment, projectUrl, branchUrl),
        title: this.activityTitle(deployment),
        author: {
          name: deployment.commit.committer.name,
          email: deployment.commit.committer.email,
          avatar: this.buildStatusAvatar(state),
        },
      }),
    };
    return fetch(url, options);
  }

  private flowdockThreadId(deployment: MinardDeployment) {
    return `minard:deployment:${deployment.projectId}:${deployment.id}`;
  }

  private buildStatusAvatar(state: MinardDeploymentStatus) {
    // TODO: show pending build separately, use proper icons
    switch (state) {
      case 'success':
      case 'pending':
      case 'running':
        return 'https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png';
      case 'failed':
      case 'canceled':
      default:
        return 'https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_fail.png';
    }
  }

  private activityTitle(deployment: MinardDeployment) {
    const fullName = `${deployment.projectName}/${deployment.ref}`;
    switch (deployment.status) {
      case 'success':
        return `Created preview for ${fullName}`;
      case 'error':
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
      case 'error':
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
    if (deployment.screenshot) {
      return (
        `<div>
          <p>${deployment.commit.message}</p>
          <img src="${deployment.screenshot}" />
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
