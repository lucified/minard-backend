import { expect } from 'chai';
import { join } from 'path';

import CharlesClient from './charles-client';
import interTeamTests from './tests-inter-team';
import intraTeamTests from './tests-intra-team';
import { CharlesClients, Config } from './types';
import {
  getAccessToken,
  getAnonymousClient,
  getConfiguration,
  isDebug,
  loadFromCache,
  saveToCache,
} from './utils';

const cacheDir = join(__dirname, '.cache');
const cacheFileName = 'integration-tests-cache.json';
const _saveToCache = saveToCache(cacheDir, cacheFileName);

function hasInterTeamClients(
  clients: Partial<CharlesClients>,
): clients is CharlesClients {
  return !!(clients && clients.admin && clients.open && clients.regular);
}

describe('system-integration', () => {
  const clientTypes: (keyof CharlesClients)[] = ['regular', 'admin', 'open'];
  let clients: Partial<CharlesClients> = {};
  let config: Config;

  before(async () => {
    config = await getConfiguration(process.env.NODE_ENV);
  });

  describe('intra-team', () => {
    for (const clientType of clientTypes) {
      describe(`user belonging to '${clientType}' team`, () => {
        after(() => {
          if (isDebug()) {
            _saveToCache(clients);
          }
        });

        const auth0Config = config.auth0[clientType];

        describe('authentication', () => {
          it('should be able to sign in with Auth0', async function() {
            this.timeout(1000 * 30);
            const accessToken = await getAccessToken(auth0Config);
            expect(accessToken).to.exist;
            clients[clientType] = new CharlesClient(
              config.charles,
              accessToken,
            );
          });
        });
        intraTeamTests(
          () => Promise.resolve(clients[clientType]!),
          auth0Config.clientId,
          auth0Config.clientSecret,
          config.notifications,
        );
      });
    }
  });

  describe('inter-team', () => {
    before(() => {
      if (isDebug()) {
        clients = loadFromCache(cacheDir, cacheFileName);
      }
      if (!hasInterTeamClients(clients)) {
        throw new Error(`All the necessary clients are not defined.`);
      }
    });
    interTeamTests(() =>
      Promise.resolve({
        ...clients as CharlesClients,
        unauthenticated: getAnonymousClient(clients.regular!),
      }),
    );
  });
});
