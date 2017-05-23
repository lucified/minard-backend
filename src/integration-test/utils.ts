import { Observable } from '@reactivex/rxjs';
import * as Boom from 'boom';
import * as chalk from 'chalk';
import { spawn } from 'child_process';
import { merge } from 'lodash';

import originalFetch, { RequestInit, Response as OriginalResponse } from 'node-fetch';
import { ENV } from '../shared/types';
import { Auth0, Config } from './types';

export function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface Response extends OriginalResponse {
  tryJson: <T>(onlyOnSuccess?: boolean) => T;
}

export type Fetch = (url: string, options?: RequestInit) => Promise<Response>;

export function fetchFactory(accessToken: string, retryCount = 0, sleepFor = 2000) {

  const innerFetch = async (url: string, options?: RequestInit) => {
    const _options: RequestInit = merge({
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: `token=${accessToken}`,
      },
    }, options || {});
    // These are here intentionally for debugging purposes
    // console.log('--> HTTP %s %s', (_options && _options.method) || 'GET', url);
    // console.dir(_options, { colors: true });
    return wrapResponse(await originalFetch(url, _options));
  };
  let out = innerFetch;
  if (retryCount > 0) {
    out = async (url: string, options?: RequestInit) => {
      for (let i = 0; i < retryCount; i++) {
        try {
          return await innerFetch(url, options);
        } catch (err) {
          log(`WARN: Fetch failed for url ${url}. Error message is '${err.message}'`);
          await sleep(sleepFor);
        }
      }
      throw Error(`Fetch failed ${retryCount} times for url ${url}`);
    };
  }
  return out;
}

function wrapResponse(response: OriginalResponse): Response {
  const _response = response as any;
  _response.tryJson = async <T>(onlyOnSuccess = true) => {
    if (!onlyOnSuccess || (response.status >= 200 && response.status < 300)) {
      try {
        return (await response.json()) as T;
      } catch (error) {
        try {
          throw Boom.create(response.status, await response.text());
        } catch (error) {
          throw Boom.create(response.status);
        }
      }
    }
    try {
      throw Boom.create(response.status, await response.text());
    } catch (error) {
      throw Boom.create(response.status);
    }
  };
  // These are here intentionally for debugging purposes
  // console.log('<-- HTTP %s', response.status);
  // console.dir(response.headers, { colors: true });
  return _response;
}

export async function runCommand(command: string, ...args: string[]): Promise<boolean> {
  const stdio: any = 'inherit';
  return await new Promise<boolean>((resolve, reject) => {
    const child = spawn(command, args, { stdio });
    child.on('close', (code: any) => {
      if (code !== 0) {
        console.log(`process exited with code ${code}`);
        reject(code);
        return;
      }
      resolve(true);
    });
    child.on('error', (err: any) => {
      console.log(`process exited with code ${err}`);
      reject(err);
    });
  });
}

export function log(text: string) {
  console.log(`    ${chalk.cyan(text)}`);
}

export function logTitle(text: string) {
  console.log(`   ${chalk.magenta(text)}`);
}

export function prettyUrl(url: string) {
  return chalk.blue.underline(url);
}

export async function getResponseJson<T>(response: OriginalResponse, requiredStatus = 200): Promise<T> {
  const responseBody = await response.text();
  let json: any;
  try {
    json = JSON.parse(responseBody);
  } catch (error) {
    // No need to handle here
  }
  if (response.status !== requiredStatus) {
    const msgParts = [
      `Got ${response.status} instead of ${requiredStatus}`,
      response.url,
      responseBody,
    ];
    throw new Error(msgParts.join(`\n\n`));
  }
  if (!json) {
    const msgParts = [
      `Unable to parse json`,
      `${response.url} => ${response.status}`,
      responseBody,
    ];
    throw new Error(msgParts.join(`\n\n`));
  }
  return json;
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
  const response = await originalFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await getResponseJson<{ access_token: string }>(response);
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
