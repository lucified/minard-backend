import * as Boom from 'boom';
import * as chalk from 'chalk';
import { spawn } from 'child_process';
import { merge } from 'lodash';
import 'reflect-metadata';

import originalFetch, {RequestInit, Response as OriginalResponse} from 'node-fetch';

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
