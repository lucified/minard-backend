#!/usr/bin/env node

import * as program from 'commander';
import * as _debug from 'debug';
import CharlesClient from '../integration-test/charles-client';
import { CharlesResponse } from '../integration-test/types';
import { getAccessToken, getConfiguration } from '../integration-test/utils';

const debug = _debug('charles-client');

program
  .version('0.0.1')
  .description(
    `Provides a cli interface for CharlesClient.
  The specified method is called with the given arguments and the output json
  is printed to stdout. See the CharlesClient class for the methods and
  their arguments.

  The authentication is handled by the same mechanism as in the integration tests,
  i.e. with the configuration files 'src/integration-test/configuration.<env>.ts',
  where env is one of 'development (default) | staging | production' and checked
  from the 'NODE_ENV' environment variable.


  Examples:
  charles-client getTeamToken lucify
  charles-client createTeamToken lucify
    `,
  )
  .usage('<method> [arguments]')
  .action(run());

program.parse(process.argv);

function run() {
  return (...cliArgs: any[]) => {
    const fn = async () => {
      cliArgs.pop();
      const methodName = cliArgs.shift();
      debug(`Calling '%s' with args %s`, methodName, cliArgs.map(a => `'${a}'`).join(', '));
      try {
        const config = await getConfiguration(
          process.env.NODE_ENV || 'development',
        );
        const accessToken = await getAccessToken(config.auth0.admin);
        const client = new CharlesClient(config.charles, accessToken);
        const response: CharlesResponse<any> = await (client as any)[methodName](cliArgs);
        const json = await response.toJson();
        return console.log(json);
      } catch (error) {
        return console.error(error.message);
      }
    };
    return fn();
  };
}
