import { Observable } from '@reactivex/rxjs';
import { merge } from 'lodash';
import fetch, { RequestInit } from 'node-fetch';

import { JsonApiEntity } from '../json-api/types';
import { NotificationConfiguration } from '../notification/types';
import { LatestDeployment, LatestProject, SSE } from './types';
import { assertResponseStatus, wrapResponse } from './utils';

const EventSource = require('eventsource');

export interface ResponseSingle {
  data: JsonApiEntity;
  included?: JsonApiEntity[];
}
export interface ResponseMulti {
  data: JsonApiEntity[];
  included?: JsonApiEntity[];
}

export default class CharlesClient {

  public teamId?: number;
  public lastDeployment?: LatestDeployment;
  public lastProject?: LatestProject;
  public readonly fetchOptions: RequestInit;

  constructor(
    public readonly url: string,
    private readonly accessToken: string,
    public readonly throwOnUnsuccessful = false,
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

  public async getProjects(teamId?: number) {
    const _teamId = teamId || await this.getTeamId();
    const response = await this.fetch<ResponseMulti>(`/api/teams/${_teamId}/relationships/projects`);
    return response;
  }

  public async getTeamId() {
    if (!this.teamId) {
      this.teamId = (await (await this.fetch<{ id: number }>('/team')).toJson()).id;
    }
    return this.teamId!;
  }

  /**
   * PROJECT
   *
   * All of the project-related functions either perform actions on the project
   * for the supplied project ID or then on the last project that was created by
   * CharlesClient.
   */

  public async getProject(projectId?: number) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const response = await this.fetch<ResponseSingle>(`/api/projects/${_projectId}`);
    return response;
  }

  /**
   * Calling this sets this.lastProject.
   */
  public async createProject(name: string, teamId?: number, templateProjectId?: number) {
    const request = await this.createProjectRequest(name, teamId, templateProjectId);
    const response = await this.fetch<ResponseSingle>(`/api/projects`, request, 201);
    const json = await response.toJson();
    this.lastProject = {
      id: Number(json.data.id),
      repoUrl: json.data.attributes['repo-url'],
      token: json.data.attributes.token,
    };
    return response;
  }

  public async editProject(
    attributes: { name: string } | { description: string } | { name: string; description: string },
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
    const response = await this.fetch<ResponseSingle>(
      `/api/projects/${_projectId}`,
      { method: 'PATCH', body: JSON.stringify(editProjectPayload) },
      200,
    );
    return response;
  }

  public deleteProject(projectId: number) {
    const path = `/api/projects/${projectId}`;
    return this.fetch<{}>(path, { method: 'DELETE' });
  }

  public async getProjectActivity(projectId?: number) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const response = await this.fetch<ResponseMulti>(`/api/activity?filter=project[${_projectId}]`);
    return response;
  }

  public async getDeployment(deploymentId: string) {
    const response = await this.fetch<ResponseSingle>(`/api/deployments/${deploymentId}`);
    return response;
  }

  public getBranches(projectId?: number) {
    const _projectId = projectId || (this.lastProject && this.lastProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetch<ResponseMulti>(
      `/api/projects/${_projectId}/relationships/branches`,
      { method: 'GET' },
      200,
    );
  }

  /**
   * COMMENTS
   */

  public async addComment(deployment: string, message: string, name: string, email: string) {
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
    const response = await this.fetch<ResponseSingle>(
      `/api/comments`,
      { method: 'POST', body: JSON.stringify(addCommentPayload) },
      201,
    );
    return response;
  }

  public async getComments(deploymentId: string) {
    const path = `/api/comments/deployment/${deploymentId}`;
    const response = await this.fetch<ResponseMulti>(path);
    return response;
  }

  public deleteComment(id: string) {
    const path = `/api/comments/${id}`;
    return this.fetch<{}>(path, { method: 'DELETE' });
  }

  /**
   * NOTIFICATION
   */

  public async getTeamNotificationConfigurations(teamId: number) {
    const response = await this.fetch<ResponseMulti>(
      `/api/teams/${teamId}/relationships/notification`,
    );
    return response;
  }

  public async getProjectNotificationConfigurations(projectId: number) {
    const response = await this.fetch<ResponseMulti>(
      `/api/projects/${projectId}/relationships/notification`,
    );
    return response;
  }

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
    const response = await this.fetch<ResponseSingle>(
      `/api/notifications`,
      { method: 'POST', body: JSON.stringify(createNotificationPayload) },
      201,
    );
    return response;
  }
  public deleteNotificationConfiguration(id: number) {
    const path = `/api/notifications/${id}`;
    return this.fetch<{}>(path, { method: 'DELETE' });
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

  public async fetch<T>(path: string, options?: RequestInit, requiredStatus = 200) {
    const url = path.match(/^http/) ? path : `${this.url}${path}`;
    const response = wrapResponse<T>(await this.rawFetch(url, options));
    if (this.throwOnUnsuccessful) {
      assertResponseStatus(response, requiredStatus);
    }
    return response;
  }

  private rawFetch(path: string, options?: RequestInit) {
    const url = path.match(/^http/) ? path : `${this.url}${path}`;
    return fetch(url, this.getRequest(options));
  }

  public getRequest(options?: RequestInit): RequestInit {
    return merge({}, this.fetchOptions, options || {});
  }

}
