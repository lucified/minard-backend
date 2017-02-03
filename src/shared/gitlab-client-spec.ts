
import { expect } from 'chai';
import 'reflect-metadata';

import { get } from '../config';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from './gitlab-client';

const host = 'gitlab';

const getClient = () => get<GitlabClient>(GitlabClient.injectSymbol);

describe('gitlab-client', () => {

  describe('auth', () => {
    it('sets authentication if nothing provided', async () => {
      // Arrange
      const gitlabClient = getClient();
      const token = await gitlabClient.getToken();

      // Act
      const h = (await gitlabClient.authenticate()).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);

    });

    it('sets authentication if some headers provided', async () => {
      // Arrange
      const gitlabClient = getClient();
      const token = await gitlabClient.getToken();

      // Act
      const h = (await gitlabClient.authenticate({ headers: { a: 'b' } })).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);
      expect(h.a).to.equal('b');

    });

    it('won\'t override authentication', async () => {
      // Arrange
      const gitlabClient = getClient();
      const opt = { headers: { [gitlabClient.authenticationHeader]: 'b' } };
      // Act
      const h = (await gitlabClient.authenticate(opt)).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal('b');

    });

  });

  describe('fetchJson', () => {
    it('gives back correct json', async () => {
      // Arrange
      interface Ijson {
        a: string;
        b: string;
      }
      const json: Ijson = {
        a: 'a',
        b: 'b',
      };
      const gitlabClient = getClient();
      fetchMock.restore().mock(`^${host}${gitlabClient.apiPrefix}/`, json);

      // Act
      const r = await gitlabClient.fetchJson<Ijson>('');
      // Assert
      expect(r.a).equals(json.a);
      expect(r.b).equals(json.b);

    });

    it('throws a Boom error object on error', async () => {
      // Arrange
      const gitlabClient = getClient();
      fetchMock.restore().mock(`^${host}${gitlabClient.apiPrefix}/`, 501);

      // Act
      try {
        const r = await gitlabClient.fetchJson<any>('');
        expect.fail(r, 0, "Should've thrown");
      } catch (err) {
        // Assert
        expect(err.output.statusCode).equals(501);
      }
    });

  });

  describe('fetch', () => {
    it.skip('can fetch deployments given project id', async () => {
      // Arrange
      const gitlabClient = getClient();
      fetchMock.mock(`^${host}${gitlabClient.apiPrefix}/`, 200);

    });
  });

  describe('getUserByEmail', () => {
    it('returns a single user', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await gitlab.getUserByEmail(email);

      // Assert
      expect(response.id).to.equal(1);

    });
    it('throws when not found', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, []);

      // Act
      try {
        await gitlab.getUserByEmail(email);
      } catch (err) {
        // Assert
        expect(err).to.exist;
        return;
      }
      expect(false, 'Shouldn\'t get here').to.be.true;

    });
  });

  describe('getUserTeams', () => {
    it('returns an array of teams', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/groups/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await gitlab.getUserTeams(1);

      // Assert
      expect(response.length).to.equal(1);
      expect(response[0].id).to.equal(1);

    });
  });

});
