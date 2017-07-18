import { inject, injectable } from 'inversify';
import nodeFetch from 'node-fetch';
import { DeploymentEvent } from '../deployment';
import { Event } from '../shared/events';
import { IFetch } from '../shared/fetch';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';
import {
  CreateDeploymentResponse,
  GitHubDeploymentOptions,
  GitHubDeploymentState,
  GitHubNotificationConfiguration,
  TokenResponse,
  UpdateDeploymentRequest,
  UpdateDeploymentResponse,
} from './types';

const jws = require('jws');

export function getGitHubHeaders(token: string, isBearer = false) {
  return {
    'User-Agent': 'curl/7.43.0',
    'Content-Type': 'application/json',
    Accept:
      'application/vnd.github.ant-man-preview+json, application/vnd.github.machine-man-preview+json',
    Authorization: (isBearer ? 'Bearer' : 'token') + ' ' + token,
  };
}
export function getGitHubAppJWT(
  integrationId: number,
  key: string,
  _iat?: number,
) {
  const iat = _iat || Math.floor(Date.now() / 1000);
  const payload = {
    iat,
    exp: iat + 60,
    iss: integrationId,
  };
  const options = {
    header: { typ: 'JWT', alg: 'RS256' },
    payload,
    secret: key,
  };
  return jws.sign(options);
}
export async function getGitHubAppInstallationAccessToken(
  installationId: number,
  jwt: string,
  githubApi = 'https://api.github.com',
  _fetch: IFetch = nodeFetch,
) {
  const url = `${githubApi}/installations/${installationId}/access_tokens`;
  const response = await _fetch(url, {
    method: 'POST',
    headers: getGitHubHeaders(jwt, true),
  });
  if (response.status !== 201) {
    const msg = `Unexpected status ${response.status} when trying to get GitHub app access token\n${url}`;
    try {
      throw Error(`${msg}\n${await response.text()}`);
    } catch (error) {
      throw Error(msg);
    }
  }
  const json: TokenResponse = await response.json();
  return json;
}

@injectable()
export class GitHubNotify {
  public static injectSymbol = Symbol('github-notify');
  public readonly baseUrl = `https://api.github.com`;
  public readonly defaultOptions: GitHubDeploymentOptions = {
    required_contexts: [],
    task: 'deploy',
    auto_merge: false,
    payload: '',
    description: '',
    transient_environment: false,
    production_environment: false,
    environment: 'minard',
  };

  public constructor(
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {}

  public async notify(
    previewUrl: string,
    event: Event<DeploymentEvent>,
    config: GitHubNotificationConfiguration,
  ) {
    const { deployment } = event.payload;
    const { githubRepo, githubOwner, githubAppId, githubAppPrivateKey } = config;
    const jwt = await getGitHubAppJWT(githubAppId, githubAppPrivateKey);
    const token = (await getGitHubAppInstallationAccessToken(
      config.githubInstallationId,
      jwt,
      this.baseUrl,
      this.fetch,
    )).token;
    const id = await this.create(
      deployment.ref,
      token,
      githubRepo,
      githubOwner,
    );
    return this.update(
      id,
      'success',
      previewUrl,
      token,
      githubRepo,
      githubOwner,
    );
  }

  public async create(
    ref: string,
    token: string,
    repo: string,
    owner: string,
    options: GitHubDeploymentOptions = {},
  ) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/deployments`;

    const response = await this.fetch(url, {
      method: 'POST',
      headers: getGitHubHeaders(token),
      body: JSON.stringify({
        ...this.defaultOptions,
        ...options,
        ref,
      }),
    });
    if (response.status !== 201) {
      const msg = `Unexpected status ${response.status} when creating GitHub deployment\n${url}`;
      try {
        throw Error(`${msg}\n${await response.text()}`);
      } catch (error) {
        throw Error(msg);
      }
    }
    const json: CreateDeploymentResponse = await response.json();
    this.logger.debug(
      `Created GitHub deployment %d for %s/%s:%s`,
      json.id,
      owner,
      repo,
      ref,
    );
    return json.id;
  }

  public async update(
    id: string,
    state: GitHubDeploymentState,
    previewUrl: string,
    token: string,
    repo: string,
    owner: string,
  ) {
    const url =
      `${this.baseUrl}/repos/${owner}/${repo}/deployments/${id}` + `/statuses`;
    const body: UpdateDeploymentRequest = {
      state,
      environment_url: previewUrl,
      auto_inactive: false,
    };
    const response = await this.fetch(url, {
      method: 'POST',
      headers: getGitHubHeaders(token),
      body: JSON.stringify(body),
    });
    if (response.status !== 201) {
      const msg = `Unexpected status ${response.status} when updating GitHub deployment ${id}\n${url}`;
      try {
        throw Error(`${msg}\n${await response.text()}`);
      } catch (error) {
        throw Error(msg);
      }
    }
    const json: UpdateDeploymentResponse = await response.json();
    this.logger.debug(`Updated GitHub deployment %d to %s`, id, state);
    return json;
  }
}
