import { Observable } from '@reactivex/rxjs';
import { merge } from 'lodash';
import fetch, { RequestInit } from 'node-fetch';

import { JsonApiEntity } from '../json-api/types';
import { NotificationConfiguration } from '../notification/types';
import {
  LatestDeployment,
  LatestProject,
  OperationsResponse,
  SSE,
} from './types';
import {
  assertResponseStatus,
  convertKeysToKebabCase,
  log,
  prettyUrl,
  wrapResponse,
} from './utils';

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
  public lastCreatedProject?: LatestProject;
  public readonly fetchOptions: RequestInit;

  constructor(
    public readonly url: string,
    public readonly accessToken: string,
    public readonly throwOnUnsuccessful = false,
    public readonly verbose = false,
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
    const _teamId = teamId || (await this.getTeamId());
    return this.fetch<ResponseMulti>(
      `/api/teams/${_teamId}/relationships/projects`,
    );
  }

  public async getTeamId() {
    if (!this.teamId) {
      this.teamId = (await (await this.fetch<{ id: number }>(
        '/team',
      )).toJson()).id;
    }
    return this.teamId!;
  }

  public async getTeamToken(teamIdOrName?: number | string) {
    const id = String(teamIdOrName || (await this.getTeamId()));
    return this.fetch<{ teamId: number; token: string; createdAt: number }>(
      `/team-token/${id}`,
    );
  }

  public async createTeamToken(teamIdOrName?: number | string) {
    const id = String(teamIdOrName || (await this.getTeamId()));
    return this.fetch<{ teamId: number; token: string; createdAt: number }>(
      `/team-token/${id}`,
      { method: 'POST' },
      201,
    );
  }

  /**
   * OPERATIONS
   */

  public async regenerateGitlabPasswords() {
    return this.fetch<OperationsResponse & { updates: any[] }>(
      `/operations/regenerate-gitlab-passwords`,
    );
  }

  public async checkScreenshots() {
    return this.fetch<OperationsResponse>(`/operations/check-screenshots`);
  }

  public async checkDeploymentActivity() {
    return this.fetch<OperationsResponse>(
      `/operations/check-deployment-activity`,
    );
  }

  public async cleanupRunningDeployments() {
    return this.fetch<OperationsResponse>(
      `/operations/cleanup-running-deployments`,
    );
  }

  /**
   * PROJECT
   *
   * All of the project-related functions either perform actions on the project
   * for the supplied project ID or then on the last project that was created by
   * CharlesClient.
   */

  public getProject(projectId?: number) {
    const _projectId =
      projectId || (this.lastCreatedProject && this.lastCreatedProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetch<ResponseSingle>(`/api/projects/${_projectId}`);
  }

  /**
   * Calling this sets this.lastProject.
   */
  public async createProject(
    name: string,
    description?: string,
    teamId?: number,
    templateProjectId?: number,
    isPublic = false,
  ) {
    const request = await this.createProjectRequest(
      name,
      description,
      teamId,
      templateProjectId,
      isPublic,
    );
    const response = await this.fetch<ResponseSingle>(
      `/api/projects`,
      request,
      201,
    );
    const json = await response.toJson();
    this.lastCreatedProject = {
      id: Number(json.data.id),
      repoUrl: json.data.attributes['repo-url'],
      token: json.data.attributes.token,
    };
    return response;
  }

  public editProject(
    attributes: { name?: string; description?: string; isPublic?: boolean },
    projectId?: number,
  ) {
    const _projectId =
      projectId || (this.lastCreatedProject && this.lastCreatedProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    const editProjectPayload = {
      data: {
        type: 'projects',
        id: _projectId,
        attributes: {
          name: attributes.name,
          description: attributes.description,
          'is-public': attributes.isPublic,
        },
      },
    };
    return this.fetch<ResponseSingle>(
      `/api/projects/${_projectId}`,
      { method: 'PATCH', body: JSON.stringify(editProjectPayload) },
      200,
    );
  }

  public deleteProject(projectId: number) {
    return this.fetch<{}>(`/api/projects/${projectId}`, { method: 'DELETE' });
  }

  public getProjectActivity(projectId?: number) {
    const _projectId =
      projectId || (this.lastCreatedProject && this.lastCreatedProject.id);
    if (!_projectId) {
      throw new Error('No projectId available');
    }
    return this.fetch<ResponseMulti>(
      `/api/activity?filter=project[${_projectId}]`,
    );
  }

  /**
   * PREVIEW
   *
   * All of the project-related functions either perform actions on the project
   * for the supplied project ID or then on the last project that was created by
   * CharlesClient.
   */
  public getPreview(deploymentId?: string, deploymentToken?: string) {
    const _deploymentId =
      deploymentId || (this.lastDeployment && this.lastDeployment.id);
    if (!_deploymentId) {
      throw new Error('No deploymentId available');
    }
    const _deploymentToken =
      deploymentToken || (this.lastDeployment && this.lastDeployment.token);
    if (!_deploymentToken) {
      throw new Error('No deploymentToken available');
    }
    return this.fetch<ResponseSingle>(
      `/api/preview/deployment/${_deploymentId}/${deploymentToken}`,
    );
  }

  public getDeployment(deploymentId: string) {
    return this.fetch<ResponseSingle>(`/api/deployments/${deploymentId}`);
  }

  public getBranches(projectId?: number) {
    const _projectId =
      projectId || (this.lastCreatedProject && this.lastCreatedProject.id);
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

  public addComment(
    deployment: string,
    message: string,
    name: string,
    email: string,
  ) {
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
    return this.fetch<ResponseSingle>(
      `/api/comments`,
      { method: 'POST', body: JSON.stringify(addCommentPayload) },
      201,
    );
  }

  public getComments(deploymentId: string) {
    return this.fetch<ResponseMulti>(
      `/api/comments/deployment/${deploymentId}`,
    );
  }

  public deleteComment(id: string) {
    return this.fetch<{}>(`/api/comments/${id}`, { method: 'DELETE' });
  }

  /**
   * NOTIFICATION
   */

  public getTeamNotificationConfigurations(teamId: number) {
    return this.fetch<ResponseMulti>(
      `/api/teams/${teamId}/relationships/notification`,
    );
  }

  public getProjectNotificationConfigurations(projectId: number) {
    return this.fetch<ResponseMulti>(
      `/api/projects/${projectId}/relationships/notification`,
    );
  }

  public configureNotification(attributes: Partial<NotificationConfiguration>) {
    const payloadAttributes: any = attributes;
    if (payloadAttributes.teamId === null) {
      delete payloadAttributes.teamId;
    }

    if (payloadAttributes.projectId === null) {
      delete payloadAttributes.projectId;
    } else {
      payloadAttributes.projectId = String(payloadAttributes.projectId);
    }

    const createNotificationPayload = {
      data: {
        type: 'notifications',
        attributes: convertKeysToKebabCase(payloadAttributes),
      },
    };

    return this.fetch<ResponseSingle>(
      `/api/notifications`,
      { method: 'POST', body: JSON.stringify(createNotificationPayload) },
      201,
    );
  }
  public deleteNotificationConfiguration(id: number) {
    return this.fetch<{}>(`/api/notifications/${id}`, { method: 'DELETE' });
  }

  /**
   * REALTIME
   */

  public async teamEvents(
    eventType: string,
    lastEventId?: string,
    teamId?: number,
  ) {
    const _teamId = teamId || (await this.getTeamId());
    const url = `${this.url}/events/${_teamId}?token=${this.accessToken}`;
    return this.realtimeEvents(url, eventType, lastEventId);
  }

  public deploymentEvents(
    eventType: string,
    deploymentId: string,
    token: string,
    lastEventId?: string,
  ) {
    const url = `${this
      .url}/events/deployment/${deploymentId}/${token}?token=${this
      .accessToken}`;
    return this.realtimeEvents(url, eventType, lastEventId);
  }

  private realtimeEvents(url: string, eventType: string, lastEventId?: string) {
    const eventSourceInitDict = lastEventId
      ? { headers: { 'Last-Event-ID': lastEventId } }
      : {};
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

  public async createProjectRequest(
    name: string,
    description?: string,
    teamId?: number,
    templateProjectId?: number,
    isPublic = false,
  ): Promise<RequestInit> {
    const _teamId = teamId || (await this.getTeamId());
    const createProjectPayload = {
      data: {
        type: 'projects',
        attributes: {
          name,
          description,
          'template-project-id': templateProjectId,
          'is-public': isPublic,
        },
        relationships: {
          team: {
            data: {
              type: 'teams',
              id: _teamId,
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

  public getRepoUrlWithCredentials(
    credentials?: { username: string; password: string },
    plainUrl?: string,
  ) {
    const repoUrl =
      plainUrl || (this.lastCreatedProject && this.lastCreatedProject.repoUrl);
    if (!repoUrl) {
      throw new Error('No projects created and plainUrl not provided');
    }
    const matches = repoUrl.match(/^(\S+\/\/[^\/]+)/);
    if (!matches) {
      throw Error('Could not match server url from repo url'); // make typescript happy
    }
    const gitserver = matches[0];
    let username = this.accessToken;
    let password = '';
    if (credentials) {
      username = credentials.username;
      password = credentials.password;
    }
    const basic = `${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}`;
    const gitServerWithCredentials = gitserver.replace('//', `//${basic}@`);
    return repoUrl.replace(gitserver, gitServerWithCredentials);
  }

  public toDto() {
    return {
      url: this.url,
      accessToken: this.accessToken,
      lastProject: this.lastCreatedProject,
      lastDeployment: this.lastDeployment,
      teamId: this.teamId,
      throwOnUnsuccessful: this.throwOnUnsuccessful,
      verbose: this.verbose,
    };
  }

  public static load(dto: any) {
    const instance = new CharlesClient(
      dto.url,
      dto.accessToken,
      dto.throwOnUnsuccessful,
      dto.verbose,
    );
    instance.lastCreatedProject = dto.lastProject;
    instance.lastDeployment = dto.lastDeployment;
    instance.teamId = dto.teamId;
    return instance;
  }

  /**
   * LOWLEVEL
   */

  public async fetch<T>(
    path: string,
    options?: RequestInit,
    requiredStatus = 200,
  ) {
    const url = path.match(/^http/) ? path : `${this.url}${path}`;
    const response = wrapResponse<T>(await this.rawFetch(url, options));
    if (this.verbose) {
      log(`\u21e0 ${response.status} ${prettyUrl(url)}`);
    }

    if (this.throwOnUnsuccessful) {
      await assertResponseStatus(response, requiredStatus, options);
    }
    return response;
  }

  private rawFetch(url: string, options?: RequestInit) {
    return fetch(url, this.getRequest(options));
  }

  public getRequest(options?: RequestInit): RequestInit {
    return merge({}, this.fetchOptions, options || {});
  }
}
