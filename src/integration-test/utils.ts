import { Observable } from '@reactivex/rxjs';
import { S3 } from 'aws-sdk';
import { create } from 'boom';
import { blue, cyan, magenta } from 'chalk';
import { spawn } from 'child_process';
import * as _debug from 'debug';
import { readFileSync, writeFileSync } from 'fs';
import { mapValues } from 'lodash';
import fetch, { Response } from 'node-fetch';
import { join } from 'path';

import { ENV } from '../shared/types';
import CharlesClient, { ResponseMulti, ResponseSingle } from './charles-client';
import { Auth0, CharlesClients, CharlesResponse, Config } from './types';

const debug = _debug('system-integration-tests');
const mkpath = require('mkpath');

export function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function wrapResponse<T>(response: Response): CharlesResponse<T> {
  const _response = response as any;
  _response.toJson = getResponseJson<T>(response);
  _response.getEntity = getEntity(_response);
  _response.getEntities = getEntities(_response);
  return _response;
}

function getEntity(response: CharlesResponse<ResponseSingle>) {
  return () => response.toJson().then(x => x.data);
}

function getEntities(response: CharlesResponse<ResponseMulti>) {
  return () => response.toJson().then(x => x.data);
}

export function getResponseJson<T>(response: Response) {
  let parsed: any;
  return async (): Promise<T> => {
    if (!parsed) {
      const responseBody = await response.text();
      try {
        parsed = JSON.parse(responseBody);
      } catch (error) {
        // No need to handle here
        const msgParts = [
          `Unable to parse json: ${error.message}`,
          `${response.url} => ${response.status}`,
          responseBody,
        ];
        const status = response.status >= 400 ? response.status : 500;
        throw create(status, msgParts.join(`\n\n`));
      }
    }
    return parsed;
  };
}

// prettier-ignore
export async function runCommand(
  command: string,
  ...args: string[],
): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const stdio = isDebug() ? 'inherit' : 'pipe';
    const child = spawn(command, args, { stdio });
    child.on('close', (code: any) => {
      if (code !== 0) {
        const msg = `process exited with code ${code}`;
        debug(msg);
        reject(new Error(msg));
        return;
      }
      resolve(true);
    });
    child.on('error', (err: any) => {
      debug(`process exited with code ${err}`);
      reject(err);
    });
  });
}

export function log(text: string) {
  debug(`${cyan(text)}`);
}

export function logTitle(text: string) {
  debug(`${magenta(text)}`);
}

export function prettyUrl(url: string) {
  return blue.underline(url);
}

export async function assertResponseStatus(
  response: Response,
  requiredStatus = 200,
  req: RequestInit = { method: 'GET', body: '' },
) {
  if (response.status !== requiredStatus) {
    const responseBody = await response.text();
    const msgParts = [
      `Got ${response.status} instead of ${requiredStatus}`,
      `${req.method} ${response.url}`,
      req.body,
      responseBody,
    ];
    const status = response.status >= 400 ? response.status : 500;
    throw create(status, msgParts.join(`\n\n`), {
      originalStatus: response.status,
    });
  }
}

export async function getAccessToken(config: Auth0) {
  const {
    domain,
    audience,
    nonInteractiveClientId,
    nonInteractiveClientSecret,
  } = config;
  const body = {
    audience,
    client_id: nonInteractiveClientId,
    client_secret: nonInteractiveClientSecret,
    grant_type: 'client_credentials',
  };
  const url = `${domain}/oauth/token`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await getResponseJson<{ access_token: string }>(response)();
  return json.access_token as string;
}

export function parseS3Url(url: string) {
  const parts = url.replace('s3://', '').split('/');
  const bucket = parts.shift();
  const key = parts.join('/');
  if (!bucket || !key) {
    throw new Error('Invalid S3 uri');
  }
  return { bucket, key };
}

export async function getConfiguration(
  env?: ENV,
  silent = false,
): Promise<Config> {
  // Load bindings that represent configuration
  const _env: ENV = env || process.env.NODE_ENV || 'development';
  let contents: any;
  switch (_env) {
    case 'staging':
      contents = require('./configuration.staging');
      break;
    case 'development':
      contents = require('./configuration.development');
      break;
    case 'production':
      contents = require('./configuration.production');
      break;
    default:
      throw new Error(`Unsupported environment '${_env}''`);
  }
  let config: Config | string = contents.default || contents;
  if (typeof config === 'string') {
    // assume it's an S3 URL
    const { bucket, key } = parseS3Url(config);
    const s3 = new S3({
      region: process.env.AWS_DEFAULT_REGION || 'eu-west-1',
    });
    const { Body } = await s3
      .getObject({
        Bucket: bucket,
        Key: key,
        ResponseContentType: 'application/json',
      })
      .promise();
    let body: string = Body as string;
    if (Buffer.isBuffer(Body)) {
      body = Body.toString();
    }
    if (typeof body !== 'string') {
      throw new Error(
        '[getConfiguration] Unable to parse body of type ' + typeof body,
      );
    }
    config = JSON.parse(body);
  }
  config = config as Config;
  if (!silent) {
    console.log(
      `Loaded configuration for environment '${_env}': ${config.charles}`,
    );
  }
  return config;
}

export function withPing<T extends object>(
  stream: Observable<T>,
  interval = 1000,
  msg = 'Waiting...',
) {
  const ping = Observable.timer(interval, interval);
  return Observable.merge(stream, ping)
    .do(event => {
      if (typeof event === 'number') {
        log(msg);
      }
    })
    .filter(event => typeof event === 'object')
    .map(event => event as T);
}

export function saveToCache(cacheDir: string, cacheFileName: string) {
  return (clients: Partial<CharlesClients>) => {
    try {
      mkpath.sync(cacheDir);
    } catch (error) {
      // nothing
    }
    const cacheFile = join(cacheDir, cacheFileName);
    const clientDtos = mapValues(clients, client => client!.toDto());
    writeFileSync(cacheFile, JSON.stringify(clientDtos, undefined, 2));
  };
}

export function loadFromCache(
  cacheDir: string,
  cacheFileName: string,
): Partial<CharlesClients> {
  const cacheFile = join(cacheDir, cacheFileName);
  const clientDtos = JSON.parse(readFileSync(cacheFile).toString());
  return mapValues(clientDtos, dto => CharlesClient.load(dto));
}

export function getAnonymousClient(client: CharlesClient) {
  const anonymous = new CharlesClient(client.url, '');
  anonymous.teamId = 9999999;
  anonymous.lastCreatedProject = {
    id: 999999999,
    repoUrl: client.lastCreatedProject!.repoUrl,
    token: client.lastCreatedProject!.token,
  };
  const anonymousUrl = client.lastDeployment!.url.replace(
    /^(https?:\/\/)\w+-\w+-\w+-\w+/,
    '$1master-abc-123-123',
  );
  anonymous.lastDeployment = {
    id: '9999999',
    url: anonymousUrl,
    screenshot: client.lastDeployment!.screenshot + 'X',
    token: '9999999',
  };
  return anonymous;
}

export function isDebug() {
  return process.env.DEBUG === 'system-integration-tests';
}

export function cloneCharlesClient(
  client: CharlesClient,
  throwOnUnsuccessful = false,
) {
  const clone = new CharlesClient(
    client.url,
    client.accessToken,
    throwOnUnsuccessful,
    client.verbose,
  );
  clone.teamId = client.teamId;
  clone.lastCreatedProject = client.lastCreatedProject;
  clone.lastDeployment = client.lastDeployment;
  return clone;
}
