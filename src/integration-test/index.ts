/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */
import { expect } from 'chai';
import * as path from 'path';

import CharlesClient from './charles-client';
import interTeamTests from './tests-inter-team';
import intraTeamTests from './tests-intra-team';
import { CharlesClients, TeamType } from './types';
import { getAccessToken, getConfiguration, loadFromCache, saveToCache } from './utils';

const cacheDir = path.join(__dirname, '.cache');
const cacheFileName = 'integration-tests-cache.json';
const _saveToCache = saveToCache(cacheDir, cacheFileName);
const config = getConfiguration(process.env.NODE_ENV);

function hasAllClients(clients: Partial<CharlesClients>): clients is CharlesClients {
  return !!(clients && clients.admin && clients.open && clients.regular);
}

describe('system-integration', () => {
  const teamTypes: TeamType[] = ['admin', 'regular', 'open'];
  describe('intra-team', () => {
    const clients: Partial<CharlesClients> = {};
    for (const teamType of teamTypes) {

      describe(`user belonging to '${teamType}' team`, () => {

        after(() => _saveToCache(clients));

        const auth0Config = config.auth0[teamType];

        describe('authentication', () => {
          it('should be able to sign in with Auth0', async function () {
            this.timeout(1000 * 30);
            const accessToken = await getAccessToken(auth0Config);
            expect(accessToken).to.exist;
            clients[teamType] = new CharlesClient(config.charles, accessToken);
          });
        });
        intraTeamTests(
          () => Promise.resolve(clients[teamType]!),
          auth0Config.clientId,
          auth0Config.gitPassword,
          config.notifications,
        );
      });
    }
  });

  describe('inter-team', () => {
    let clients: CharlesClients;
    before(() => {
      const _clients = loadFromCache(cacheDir, cacheFileName);
      if (!hasAllClients(_clients)) {
        throw new Error(`Invalid cache`);
      }
      clients = _clients;
    });
    interTeamTests(() => Promise.resolve(clients));
  });
});
