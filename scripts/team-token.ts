import * as Boom from 'boom';
import * as chalk from 'chalk';
import * as program from 'commander';
import { JWTStrategyOptions } from 'hapi-auth-jwt2';
import 'reflect-metadata';

import { jwtOptionsInjectSymbol } from '../src/authentication/types';
import { get } from '../src/config';
import { IFetch, Response } from '../src/shared/fetch';
import { fetchInjectSymbol } from '../src/shared/types';

type Command = typeof getTeamToken;

const jwtOptions = get<JWTStrategyOptions>(jwtOptionsInjectSymbol);
let defaultDomain: string | undefined;
let defaultAudience: string | undefined;

if (jwtOptions && jwtOptions.verifyOptions) {
  if (jwtOptions.verifyOptions.issuer) {
    defaultDomain = jwtOptions.verifyOptions.issuer.replace(/\/$/, '');
  }
  if (jwtOptions.verifyOptions.audience) {
    defaultAudience = jwtOptions.verifyOptions.audience;
  }
}

require('pkginfo')(module, 'version');
program
  .version(module.exports.version)
  .description(
    `Provides tools for managing team tokens, which are used for signing up to a specific team.

  The user of these commands must be authorized.
  Only Minard users belonging to the admin team (specified by 'ADMIN_TEAM_NAME' in Minard's
  configuration) have sufficient privileges.`,
  )
  .usage('-u <username> -p <password> -c <client-id> <command> <team-id>')
  .option('-u, --username <username>', 'Auth0 username')
  .option('-p, --password <password>', 'Auth0 password')
  .option('-c, --client-id <client-id>', 'Auth0 client-id')
  .option('-d, --domain <domain>', 'Auth0 domain')
  .option('-a, --audience <client-id>', 'Audience');

program
  .command('get <team-id>')
  .description('Retrieve the latest team token for the specified team')
  .action((teamId: string, options: any) => {
    run(parseInt(teamId, 10), options, getTeamToken);
  });

program
  .command('generate <team-id>')
  .description('Generate a new team token for the specified team while invalidating any previous ones')
  .action((teamId: string, options: any) => {
    run(parseInt(teamId, 10), options, generateTeamToken);
  });

program.parse(process.argv);


function run(teamId: number, options: any, command: Command) {
  const {
    username,
    password,
    clientId,
    domain,
    audience,
  } = options.parent;
  const fetch = get<IFetch>(fetchInjectSymbol);
  const _domain = domain || defaultDomain;
  const _audience = audience || defaultAudience;

  getAccessToken(
    username,
    password,
    clientId,
    _domain,
    _audience,
    fetch,
  )
  .then(command.bind(undefined, _audience, teamId, fetch))
  .then(token => {
    log(token);
    process.exit(0);
  })
  .catch(err => {
    if (err.isBoom && err.data && err.data.url) {
      console.log(`Got ${chalk.bold.red(err.message)} from ${err.data.url}`);
    } else {
      console.log(chalk.red(err.message));
    }
    process.exit(1);
  });
}

export function log(obj: any) {
  console.dir(obj, { colors: true });
}

export default async function getAccessToken(
  username: string,
  password: string,
  clientId: string,
  auth0Domain: string,
  audience: string,
  fetch: IFetch,
) {
  const body = {
    realm: 'Username-Password-Authentication',
    audience,
    client_id: clientId,
    scope: 'openid profile',
    grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
    username,
    password,
  };
  const url = `${auth0Domain}/oauth/token`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await getResponseJson(response, url);
  return json.access_token as string;
}

async function getResponseJson(response: Response, url?: string) {
  const responseBody = await response.text();
  let json: any;
  try {
    json = JSON.parse(responseBody);
  } catch (error) {
    // No need to handle here
  }
  if (!json || response.status >= 400) {
    throw Boom.create(response.status, undefined, { content: json || responseBody, url });
  }
  return json;
}

export async function getTeamToken(charlesBaseUrl: string, teamId: number, fetch: IFetch, accessToken: string) {
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  };
  const url = `${charlesBaseUrl}/team-token/${teamId}`;
  const response = await fetch(url, options);
  return getResponseJson(response, url);
}

export async function generateTeamToken(charlesBaseUrl: string, teamId: number, fetch: IFetch, accessToken: string) {
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  };
  const url = `${charlesBaseUrl}/team-token/${teamId}`;
  const response = await fetch(url, options);
  return getResponseJson(response, url);
}
