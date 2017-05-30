import { Observable } from '@reactivex/rxjs';
import { merge } from 'lodash';
import fetch, { RequestInit } from 'node-fetch';

import { JsonApiEntity } from '../json-api/types';
import { NotificationConfiguration } from '../notification/types';
import { SSE } from './types';
import { getResponseJson, sleep } from './utils';

const EventSource = require('eventsource');

interface ResponseSingular {
  data: JsonApiEntity;
  included?: JsonApiEntity[];
}
interface ResponseMulti {
  data: JsonApiEntity[];
  included?: JsonApiEntity[];
}

export default class CharlesClient {

  public teamId: number | undefined;
  public lastDeployment: {
    id: string;
    url: string;
    screenshot: string;
    token: string;
  } | undefined;
  public lastProject: {
    id: number;
    repoUrl: string;
    token: string;
  } | undefined;
  private readonly fetchOptions: RequestInit;

  constructor(
    public readonly url: string,
    private readonly accessToken: string,
  ) {
    this.fetchOptions = {
      method: 'GET',
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

  public async getProjects(teamId?: number): Promise<JsonApiEntity[]> {
    const _teamId = teamId || await this.getTeamId();
    const response = await this.fetchJson<ResponseMulti>(`/api/teams/${_teamId}/relationships/projects`);
    return response.data;
  }

  public async getTeamId() {
    if (!this.teamId) {
      this.teamId = (await this.fetchJson<{ id: number }>('/team')).id;
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

  public async getProject(projectId?: number): Promise<JsonApiEntity> {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const response = await this.fetchJson<ResponseSingular>(`/api/projects/${_projectId}`);
    return response.data;
  }

  public async createProject(name: string, teamId?: number, templateProjectId?: number): Promise<JsonApiEntity> {
    const request = await this.createProjectRequest(name, teamId, templateProjectId);
    const response = await this.fetchJsonWithRetry<ResponseSingular>(`/api/projects`, request, 201, 20);
    this.lastProject = {
      id: Number(response.data.id),
      repoUrl: response.data.attributes['repo-url'],
      token: response.data.attributes.token,
    };
    return response.data;
  }

  public async editProject(
    attributes: { name: string } | { description: string } | { name: string; description: string },
    projectId?: number,
  ): Promise<JsonApiEntity> {
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
    const response = await this.fetchJsonWithRetry<ResponseSingular>(
      `/api/projects/${_projectId}`,
      { method: 'PATCH', body: JSON.stringify(editProjectPayload) },
      200,
    );
    return response.data;
  }

  public deleteProject(projectId: number) {
    return this.fetch(`${this.url}/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  public async getProjectActivity(projectId?: number): Promise<JsonApiEntity[]> {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const response = await this.fetchJsonWithRetry<ResponseMulti>(`/api/activity?filter=project[${_projectId}]`);
    return response.data;
  }

  public async getDeployment(deploymentId: string): Promise<JsonApiEntity> {
    const response = await this.fetchJson<ResponseSingular>(`/api/deployments/${deploymentId}`);
    return response.data;
  }

  public getBranches(projectId?: number): Promise<ResponseMulti> {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetchJsonWithRetry<ResponseMulti>(
      `/api/projects/${_projectId}/relationships/branches`,
      { method: 'GET' },
      200,
      20,
    );
  }

  /**
   * COMMENTS
   */

  public async addComment(deployment: string, message: string, name: string, email: string): Promise<JsonApiEntity> {
    const addCommentPayload = {
      data: {
        type: 'comments',
        attributes: {
          email,
          message,
          name,
          deployment,
        },
      },
    };
    const response = await this.fetchJson<ResponseSingular>(
      `/api/comments`,
      { method: 'POST', body: JSON.stringify(addCommentPayload) },
      201,
    );
    return response.data;
  }

  public async getComments(deploymentId: string): Promise<JsonApiEntity[]> {
    const path = `/api/comments/deployment/${deploymentId}`;
    const response = await this.fetchJsonWithRetry<ResponseMulti>(path, undefined, 200, 15, 400);
    return response.data;
  }

  public deleteComment(id: string) {
    return this.fetch(`${this.url}/api/comments/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * NOTIFICATION
   */

  public async getTeamNotificationConfigurations(teamId: number): Promise<JsonApiEntity[]> {
    const response = await this.fetchJson<ResponseMulti>(
      `/api/teams/${teamId}/relationships/notification`,
    );
    return response.data;
  }

  public async getProjectNotificationConfigurations(projectId: number): Promise<JsonApiEntity[]> {
    const response = await this.fetchJson<ResponseMulti>(
      `/api/projects/${projectId}/relationships/notification`,
    );
    return response.data;
  }

  public async configureNotification(attributes: NotificationConfiguration): Promise<JsonApiEntity> {
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
    const response = await this.fetchJson<ResponseSingular>(
      `/api/notifications`,
      { method: 'POST', body: JSON.stringify(createNotificationPayload) },
      201,
    );
    return response.data;
  }
  public deleteNotificationConfiguration(id: number) {
    return this.fetch(`${this.url}/api/notifications/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * REALTIME
   */

  public async teamEvents(eventType: string, lastEventId?: string, teamId?: number) {
    const _teamId = teamId || await this.getTeamId();
    const url = `${this.url}/events/${_teamId}?token=${this.accessToken}`;
    return this.realtimeEvents(url, eventType, lastEventId);
  }

  public deploymentEvents(
    eventType: string,
    deploymentId: string,
    token: string,
    lastEventId?: string,
  ) {
    const url = `${this.url}/events/deployment/${deploymentId}/${token}?token=${this.accessToken}`;
    return this.realtimeEvents(url, eventType, lastEventId);
  }

  private realtimeEvents(
    url: string,
    eventType: string,
    lastEventId?: string,
  ) {
    const eventSourceInitDict = lastEventId ? { headers: { 'Last-Event-ID': lastEventId } } : {};
    let eventSource = new EventSource(url, eventSourceInitDict);

    return Observable.fromEventPattern(
      (h: any) => {
        eventSource.addEventListener(eventType, h);
      },
      (h: any) => {
        eventSource.removeEventListener(eventType, h);
        eventSource.close();
        eventSource = null;
      },
    ).map(event => event as SSE);
  }

  /**
   * OTHER
   */

  public getRepoUrlWithCredentials(clientId: string, password: string, plainUrl?: string) {
    let repoUrl: string | undefined;
    if (this.lastProject) {
      repoUrl = this.lastProject.repoUrl;
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
    const credentials = `${encodeURIComponent('clients-' + clientId)}:${encodeURIComponent(password)}`;
    const gitServerWithCredentials = gitserver
      .replace('//', `//${credentials}@`);
    return repoUrl.replace(gitserver, gitServerWithCredentials);
  }

  public toDto() {
    return {
      url: this.url,
      accessToken: this.accessToken,
      lastProject: this.lastProject,
      lastDeployment: this.lastDeployment,
      teamId: this.teamId,
    };
  }

  public static load(dto: any) {
    const instance = new CharlesClient(dto.url, dto.accessToken);
    instance.lastProject = dto.lastProject;
    instance.lastDeployment = dto.lastDeployment;
    instance.teamId = dto.teamId;
    return instance;
  }

  /**
   * LOWLEVEL
   */

  private async fetchJson<T>(path: string, options?: RequestInit, requiredStatus = 200) {
    const response = await this.fetch(`${this.url}${path}`, options);
    return getResponseJson<T>(response, requiredStatus);
  }

  public fetch(url: string, options?: RequestInit) {
    return fetch(url, this.getRequest(options));
  }

  public async fetchWithRetry(
    url: string,
    expectedStatus = 200,
    options?: RequestInit,
    num = 15,
    sleepFor = 200,
  ) {
    const errors: string[] = [];
    for (let i = 0; i < num; i++) {
      try {
        const response = await this.fetch(url, options);
        if (response.status === expectedStatus) {
          return response;
        }
      } catch (err) {
        errors.push(err.message);
      }
      await sleep(sleepFor);
    }
    const msgParts = [
      `Fetch failed ${num} times for ${url}`,
    ].concat(errors);
    throw new Error(msgParts.join(`\n\n`));
  }

  public async fetchJsonWithRetry<T>(
    path: string,
    options?: RequestInit,
    requiredStatus = 200,
    num = 15,
    sleepFor = 200,
  ) {
    const errors: string[] = [];
    for (let i = 0; i < num; i++) {
      try {
        return await this.fetchJson<T>(path, options, requiredStatus);
      } catch (err) {
        errors.push(err);
        await sleep(sleepFor);
      }
    }
    const msgParts = [
      `Fetch failed ${num} times for ${this.url}${path}`,
    ].concat(errors);
    throw new Error(msgParts.join(`\n\n`));
  }

  public getRequest(options?: RequestInit): RequestInit {
    return merge({}, this.fetchOptions, options || {});
  }

}
