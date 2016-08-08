
import { expect } from 'chai';

import Authentication from '../authentication/authentication-module';
import { GitlabClient } from './gitlab-client';

const fetchMock = require('fetch-mock');

const host = 'gitlab';
const token = 'the-sercret';

const getClient = () => {

  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return token;
    }
  }

  return new GitlabClient(host, fetchMock.fetchMock as IFetchStatic, new MockAuthModule() as Authentication, false);
};

describe('gitlab-client', () => {

  describe('auth', () => {
    it('sets authentication if nothing provided', async () => {
      // Arrange
      const gitlabClient = getClient();

      // Act
      const h = (await gitlabClient.authenticate()).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);

    });

    it('sets authentication if some headers provided', async () => {
      // Arrange
      const gitlabClient = getClient();

      // Act
      const h = (await gitlabClient.authenticate({headers: {a: 'b'}})).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);
      expect(h.a).to.equal('b');

    });

    it('won\'t override authentication', async () => {
      // Arrange
      const gitlabClient = getClient();
      const opt = {headers: {[gitlabClient.authenticationHeader]: 'b'}};
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

});
