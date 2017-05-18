import { Observable } from '@reactivex/rxjs';
import { merge } from 'lodash';
import fetch, { RequestInit } from 'node-fetch';
import { JsonApiEntity } from '../json-api/types';
import { NotificationConfiguration } from '../notification/types';
import { getResponseJson, sleep } from './utils';

const EventSource = require('eventsource');

export default class CharlesClient {

  private teamId: number | undefined;
  public lastProject: {
    id: number;
    url: string;
  } | undefined;
  private readonly fetchOptions: RequestInit;

  constructor(
    private readonly url: string,
    private readonly accessToken: string,
  ) {
    this.fetchOptions = {
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: `token=${accessToken}`,
      },
    };
  }

  /**
   * TEAM
   */

  public async getProjects(teamId?: number) {
    const _teamId = teamId || await this.getTeamId();
    return this.fetchJson(`/api/teams/${_teamId}/relationships/projects`);
  }

  public async getTeamId() {
    if (!this.teamId) {
      this.teamId = (await this.fetchJson('/team')).id;
    }
    return this.teamId!;
  }

  /**
   * PROJECT
   */

  public async createProjectRequest(name: string, teamId?: number, templateProjectId?: number): Promise<RequestInit> {
    const _teamId = teamId || await this.getTeamId();
    const createProjectPayload = {
      'data': {
        'type': 'projects',
        'attributes': {
          'name': name,
          'description': 'foo bar',
          'templateProjectId': templateProjectId,
        },
        'relationships': {
          'team': {
            'data': {
              'type': 'teams',
              'id': _teamId,
            },
          },
        },
      },
    };
    return {
      method: 'POST',
      body: JSON.stringify(createProjectPayload),
    };
  }
  public async createProject(name: string, teamId?: number, templateProjectId?: number) {
    const request = await this.createProjectRequest(name, teamId, templateProjectId);
    const response = await this.fetchJsonWithRetry(`/api/projects`, request, 20);
    this.lastProject = {
      id: Number(response.data.id),
      url: response.data.attributes['repo-url'],
    };
    return response;
  }
  public async editProject(
    attributes: { name: string } | {description: string} | {name: string; description: string},
    projectId?: number,
  ) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const editProjectPayload = {
      'data': {
        'type': 'projects',
        'id': _projectId,
        attributes,
      },
    };
    const response = await this.fetchJsonWithRetry(`/api/projects/${_projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(editProjectPayload),
    }, 20);
    return response.data;
  }

  public deleteProject(projectId: number) {
    return this.fetchJson(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  public getProjectActivity(projectId?: number) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetchJsonWithRetry(`/api/activity?filter=project[${_projectId}]`);
  }

  public async getDeployment(deploymentId: string) {
    const response = await this.fetchJson(`/api/deployments/${deploymentId}`);
    return response.data as JsonApiEntity;
  }

  public getBranches(projectId?: number) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetchJsonWithRetry(
      `/api/projects/${_projectId}/relationships/branches`,
      { method: 'GET' },
      20,
    );
  }

  /**
   * NOTIFICATION
   */

  public async configureNotification(attributes: NotificationConfiguration) {
    if (attributes.teamId === null) {
      delete attributes.teamId;
    }
    if (attributes.projectId === null) {
      delete attributes.projectId;
    }
    const createNotificationPayload = {
      'data': {
        'type': 'notifications',
        attributes,
      },
    };
    const response = await this.fetchJson(
      `/api/notifications`,
      { method: 'POST', body: JSON.stringify(createNotificationPayload) },
    );
    return response.data;
  }
  public deleteNotificationConfiguration(id: number) {
    return this.fetchJson(`/api/notifications/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * REALTIME
   */

  public async teamEvents(eventType: string, teamId?: number) {
    const _teamId = teamId || await this.getTeamId();
    const eventSource = new EventSource(`${this.url}/events/${_teamId}?token=${this.accessToken}`);
    const stream = Observable.fromEventPattern(
      (h: any) => {
        eventSource.addEventListener(eventType, h);
      },
      (h: any) => {
        eventSource.removeListener(eventType, h);
      },
    );
    return stream.do(e => {
      console.log(e);
    });
  }

  public deploymentEvents(eventType: string, projectId: number, deploymentId: number, token: string) {
    // tslint:disable-next-line:max-line-length
    const eventSource = new EventSource(`${this.url}/events/deployment/${projectId}-${deploymentId}/${token}?token=${this.accessToken}`);
    return Observable.fromEventPattern(
      (h: any) => eventSource.addEventListener(eventType, h),
      (h: any) => eventSource.removeListener(eventType, h),
    );
  }

  /**
   * OTHER
   */

  public getRepoUrlWithCredentials(clientId: string, password: string, plainUrl?: string) {
    let repoUrl: string | undefined;
    if (this.lastProject) {
      repoUrl = this.lastProject.url;
    }
    if (plainUrl) {
      repoUrl = plainUrl;
    }
    if (!repoUrl) {
      throw new Error('No projects created and plainUrl not provided');
    }
    const matches = repoUrl.match(/^(\S+\/\/[^\/]+)/);
    if (!matches) {
      throw Error('Could not match server url from repo url'); // make typescript happy
    }
    const gitserver = matches[0];
    const credentials = `${encodeURIComponent(clientId + '-clients')}:${encodeURIComponent(password)}`;
    const gitServerWithCredentials = gitserver
      .replace('//', `//${credentials}@`);
    return repoUrl.replace(gitserver, gitServerWithCredentials);
  }

  /**
   * LOWLEVEL
   */

  private async fetchJson(path: string, options?: RequestInit) {
    const response = await fetch(`${this.url}${path}`, this.getRequest(options));
    return getResponseJson(response);
  }

  public async fetch(url: string, options?: RequestInit) {
    return fetch(url, this.getRequest(options));
  }

  public async fetchJsonWithRetry(
    path: string,
    options?: RequestInit,
    num = 15,
    sleepFor = 200,
  ) {
    for (let i = 0; i < num; i++) {
      try {
        return await this.fetchJson(path, options);
      } catch (err) {
        await sleep(sleepFor);
      }
    }
    throw Error(`Fetch failed ${num} times for ${this.url}${path}`);
  }

  public getRequest(options?: RequestInit): RequestInit {
    return merge(this.fetchOptions, options || {});
  }

}
