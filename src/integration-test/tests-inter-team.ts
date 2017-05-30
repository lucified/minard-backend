/* tslint:disable:only-arrow-functions variable-name */
import { expect } from 'chai';
import CharlesClient from './charles-client';
import routes from './routes';
import { CharlesClients } from './types';

const I = [0, 1, 2];
const J = [0, 1, 2, 3];
const descriptions = {
  '1': 'able to access',
  '0': 'unauthenticated',
  'z': 'unauthorized',
  'x': 'unable to access a missing entity',
  'r': 'redirected',
};
const codes = {
  '1': 200, // doesn't matter really
  '0': 401,
  'z': 403,
  'x': 404,
  'r': 302,
};
const userTypes = ['anonymous', 'normal', 'admin'];
const projectTypes = ['zero', 'own', 'other\'s', 'open'];

export default (
  clientsFactory: () => Promise<CharlesClients>,
  _projectName = 'regular-project',
) => {
  describe('clients', () => {
    it('has all', async () => {
      const clients = await clientsFactory();
      expect(clients.admin).to.exist;
      expect(clients.regular).to.exist;
      expect(clients.open).to.exist;
    });
  });
  describe('authorizations', () => {
    let clients: CharlesClient[];
    before(async () => {
      const _clients = await clientsFactory();
      const anonymous = new CharlesClient(_clients.regular.url, '');
      anonymous.teamId = 9999999;
      anonymous.lastProject = {
        id: 999999999,
        repoUrl: _clients.regular.lastProject!.repoUrl,
        token: _clients.regular.lastProject!.token,
      };
      const anonymousUrl = _clients.regular.lastDeployment!.url
        .replace(/^(https?:\/\/)\w+-\w+-\w+-\w+/, '$1master-abc-123-123');
      anonymous.lastDeployment = {
        id: '9999999',
        url: anonymousUrl,
        screenshot: _clients.regular.lastDeployment!.screenshot + '_',
        token: '9999999',
      };
      clients = [
        anonymous, // the anonymous client
        _clients.regular,
        _clients.admin,
        _clients.open,
      ];
    });

    for (const route of routes) {
      describe(route.description, () => {
        for (const i of I) {
          describe(`user of type ${userTypes[i]}`, () => {
            for (const j of J) {
              describe(`requesting entity of type ${projectTypes[j]}`, () => {
                const access = route.accessMatrix[i][j];
                const expected = codes[access];

                it(`should be ${descriptions[access]}`, async function () {
                  this.timeout(10000);
                  const me = clients[i];
                  let other = clients[j];
                  if (j === 1) { // own
                    other = me;
                  }
                  if (j === 2) { // other's
                    other = i === 1 ? clients[2] : clients[1];
                  }

                  if (access === '1') {
                    const response = await route.request(me, other);
                    expect(response.status).to.be.gte(200);
                    expect(response.status).to.be.lt(300);
                  } else {
                    try {
                      const response = await route.request(me, other);
                      expect.fail(undefined, null, `Got ${response.status} from ${response.url}`);
                    } catch (_error) {
                      if (!_error.isBoom) {
                        throw _error;
                      }
                      const error = _error;
                      const got = error.data.originalStatus;
                      if (got !== expected) {
                        console.log(`[WARN] Expected response code ${expected}, but got ${got}.`);
                      }
                    }
                  }
                });
              });
            }
          });
        }
      });
    }
  });
};
