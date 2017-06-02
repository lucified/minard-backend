import { Observable } from '@reactivex/rxjs';
import * as Boom from 'boom';
import * as chalk from 'chalk';
import { spawn } from 'child_process';
import * as _debug from 'debug';
import * as fs from 'fs';
import { mapValues } from 'lodash';
import fetch, { Response } from 'node-fetch';
import * as path from 'path';

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
        throw Boom.create(status, msgParts.join(`\n\n`));
      }
    }
    return parsed;
  };
}

export async function runCommand(command: string, ...args: string[]): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const stdio = isDebug() ? 'inherit' : 'pipe';
    const child = spawn(command, args, { stdio });
    child.on('close', (code: any) => {
      if (code !== 0) {
        debug(`process exited with code ${code}`);
        reject(code);
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
  debug(`    ${chalk.cyan(text)}`);
}

export function logTitle(text: string) {
  debug(`   ${chalk.magenta(text)}`);
}

export function prettyUrl(url: string) {
  return chalk.blue.underline(url);
}

export function assertResponseStatus(response: Response, requiredStatus = 200) {
  if (response.status !== requiredStatus) {
    const msgParts = [
      `Got ${response.status} instead of ${requiredStatus}`,
      response.url,
    ];
    const status = response.status >= 400 ? response.status : 500;
    throw Boom.create(status, msgParts.join(`\n\n`), { originalStatus: response.status });
  }
}

export async function getAccessToken(config: Auth0) {
  const { domain, audience, clientId, clientSecret } = config;
  const body = {
    audience,
    client_id: clientId,
    client_secret: clientSecret,
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

export function getConfiguration(env?: ENV, silent = false): Config {
  // Load bindings that represent configuration
  const _env: ENV = env || process.env.NODE_ENV || 'development';
  let config: any;
  switch (_env) {
    case 'staging':
      config = require('./configuration.staging').default;
      break;
    case 'development':
      config = require('./configuration.development').default;
      break;
    case 'production':
      config = require('./configuration.production').default;
      break;
    default:
      throw new Error(`Unsupported environment '${_env}''`);
  }
  if (!silent) {
    console.log(`Loaded configuration for environment '${_env}'`);
  }
  return config;
}

export function withPing<T extends object>(stream: Observable<T>, interval = 1000, msg = 'Waiting...') {
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
    const cacheFile = path.join(cacheDir, cacheFileName);
    const clientDtos = mapValues(clients, client => client!.toDto());
    fs.writeFileSync(cacheFile, JSON.stringify(clientDtos, undefined, 2));
  };
}

export function loadFromCache(cacheDir: string, cacheFileName: string): Partial<CharlesClients> {
  const cacheFile = path.join(cacheDir, cacheFileName);
  const clientDtos = JSON.parse(fs.readFileSync(cacheFile).toString());
  return mapValues(clientDtos, dto => CharlesClient.load(dto));
}

export function getAnonymousClient(client: CharlesClient) {
  const anonymous = new CharlesClient(client.url, '');
  anonymous.teamId = 9999999;
  anonymous.lastProject = {
    id: 999999999,
    repoUrl: client.lastProject!.repoUrl,
    token: client.lastProject!.token,
  };
  const anonymousUrl = client.lastDeployment!.url
    .replace(/^(https?:\/\/)\w+-\w+-\w+-\w+/, '$1master-abc-123-123');
  anonymous.lastDeployment = {
    id: '9999999',
    url: anonymousUrl,
    screenshot: client.lastDeployment!.screenshot + '_',
    token: '9999999',
  };
  return anonymous;
}

export function isDebug() {
 return process.env.DEBUG === 'system-integration-tests';
}
