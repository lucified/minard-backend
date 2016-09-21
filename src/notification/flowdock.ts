
import {
  MinardDeployment,
  MinardDeploymentStatus,
} from '../deployment';

export interface Options {
  owner: string;
  repository: string;
  branch: string;
  committer: string;
  environment: string;
}

type ThreadField = { label: string, value: string };

export class FlowdockNotify {

  private readonly deployment: MinardDeployment;
  private readonly flowToken: string;
  private readonly projectUrl: string;
  private readonly branchUrl: string;

  constructor(deployment: MinardDeployment, flowToken: string, projectUrl: string, branchUrl: string) {
    this.deployment = deployment;
    this.flowToken = flowToken;
    this.projectUrl = projectUrl;
    this.branchUrl = branchUrl;
  }

  public notify() {
    const state = this.deployment.status;
    const url = `https://api.flowdock.com/messages`;
    const options = {
      method: 'POST',
      headers: {
        'User-Agent': 'request',
        'X-flowdock-wait-for-message': 'true',
      },
      json: true,
      body: JSON.stringify({
        flow_token: this.flowToken,
        event: 'activity',
        external_thread_id: this.flowdockThreadId(this.deployment.id),
        thread: this.threadData(this.deployment),
        title: this.activityTitle(state),
        author: {
          name: this.deployment.commit.committer.name,
          email: this.deployment.commit.committer.email,
          avatar: this.buildStatusAvatar(state),
        },
      }),
    };
    return fetch(url, options);
  }

  private flowdockThreadId(deploymentId: number) {
    return `minard:deployment:${this.deployment.projectId}:${deploymentId}`;
  }

  private buildStatusAvatar(state: MinardDeploymentStatus) {
    // TODO: show pending build separately, use proper icons
    if (state === 'success' || state === 'pending') {
      return 'https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_ok.png';
    }
    return 'https://d2ph5hv9wbwvla.cloudfront.net/heaven/build_fail.png';
  }

  private activityTitle(state: MinardDeploymentStatus) {
    const fullName = `${this.deployment.projectName}/${this.deployment.ref}`;
    switch (state) {
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
        return `Unknown deployment state, ${state}`;
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

  private threadData(deployment: MinardDeployment) {
    const state = deployment.status;
    return {
      title: this.activityTitle(state),
      body: this.threadBody(deployment),
      external_url: this.deployment.status === 'success' ? this.deployment.url : this.projectUrl,
      status: {
        value: state,
        color: this.threadStatusColor(state),
      },
      fields: this.threadFields(state),
    };
  }

  private threadFields(state: MinardDeploymentStatus): ThreadField[] {
    const fields: ThreadField[] = [];

    fields.push({
      label: 'Author',
      value: this.deployment.commit.author.name,
    });

    if (this.projectUrl) {
      fields.push({
        label: 'Project',
        value: `<a href="${this.projectUrl}">${this.deployment.projectName}</a>`,
      });
    }

    if (this.branchUrl) {
      fields.push({
        label: 'Branch',
        value: `<a href="${this.branchUrl}">${this.deployment.ref}</a>`,
      });
    }

    if (this.deployment.url) {
      fields.push({
        label: 'Preview',
        value: `<a href="${this.deployment.url}">${this.deployment.url}</a>`,
      });
    }

    if (this.deployment.screenshot) {
      fields.push({
        label: 'Screenshot',
        value: `<a href="${this.deployment.screenshot}">${this.deployment.screenshot}</a>`,
      });
    }

    return fields;
  }
}
