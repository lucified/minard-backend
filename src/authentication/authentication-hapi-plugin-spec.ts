import { expect } from 'chai';
import 'reflect-metadata';

import { get } from '../config';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import { getUserByEmail, getUserTeams } from './authentication-hapi-plugin';

const validToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik1FWTVSVGxCTWtWQk56RTJRam
d3TnpCRE1qSkNRalk0TkVReE4wVXpRemd4UVRRek16SkNRUSJ9.
eyJpc3MiOiJodHRwczovL2x1Y2lmeS5ldS5hdXRoMC5jb20vIiwic3ViIjoiZ2l0a
HVifDExMjU2MCIsImF1ZCI6WyJodHRwczovL2NoYXJsZXMtc3RhZ2luZy5taW5hcmQ
uaW8iLCJodHRwczovL2x1Y2lmeS5ldS5hdXRoMC5jb20vdXNlcmluZm8iXSwiYXpwI
joiRjdMc0RrVnhxd0ZyZmUwcWp0STFiZ3VKU0w3eEdrQTMiLCJleHAiOjE0ODU4MTA5
MjYsImlhdCI6MTQ4NTgwMzcyNiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCIsI
mh0dHBzOi8vdGVhbV90b2tlbiI6IjEyMzM0NTN4eXgiLCJodHRwczovL3N1Yl9lbWFpbCI
6InZqdmFhbmFuQGdtYWlsLmNvbSJ9.
GIhqYu8tD0T1UyTcBmZw_boGJqEZZrABOv7Uezp6Ybci2QSMFXt13XZImRJC2CjiczOJHdd
PK9KgxMvoUYJiU63n2wOif6oMPE_slTtThIj21PhkUSrOcxlyEV8k-FgHEcfinJnD8OBF6j5
oViotIgygMyneWcYIa6DChDekh0kONYRyR57tBEq_pztY3LE42NdKzj5jPZSRoFXWXEMW74x
1coZvOLG4ppfzJgm8GZgyh6a5Z9kCpKZiWROjkKK_D4riCDTHRpukjXBgatiMmLMBPKYDYWu
d929kmWx_wd2xc9Sr9Do-3LGDF9_OCtfGiFwoU8EksfvLh7NhTHi0ug`.replace(/\s|[^\x20-\x7E]/gmi, '');

const invalidToken = validToken.replace(/u/gim, 'i');

async function getServer() {
  const plugin = get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
  const server = await getTestServer(plugin);
  return server;
}

describe('authentication-hapi-plugin', () => {

  describe('getUserByEmail', () => {
    it('returns a single user', async () => {
      // Arrange
      const gitlab = get<GitlabClient>(GitlabClient.injectSymbol);
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await getUserByEmail(email, gitlab);

      // Assert
      expect(response.id).to.equal(1);

    });
    it('throws when not found', async () => {
      // Arrange
      const gitlab = get<GitlabClient>(GitlabClient.injectSymbol);
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, []);

      // Act
      try {
        await getUserByEmail(email, gitlab);
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
      const gitlab = get<GitlabClient>(GitlabClient.injectSymbol);
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/groups/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await getUserTeams(1, gitlab);

      // Assert
      expect(response.length).to.equal(1);
      expect(response[0].id).to.equal(1);

    });
  });

  describe('jwt verification', () => {

    it('should return 401 for invalid token', async () => {
      // Arrange
      const server = await getServer();

      // Act
      let response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);

      // Act
      response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${invalidToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);
    });

    it('should return 200 for valid token', async () => {
      // Arrange
      const server = await getServer();
      fetchMock.restore();
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: 'fooGroup',
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${validToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(200);
    });
  });
  describe('team endpoint', () => {

    it('should return team id and name', async () => {
      // Arrange
      const server = await getServer();
      fetchMock.restore();
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: 'fooGroup',
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${validToken}`,
        },
      });

      const payload = JSON.parse(response.payload);
      // Assert
      expect(payload.length, payload).to.equal(1);
      expect(payload[0].id, payload).to.equal(1);
      expect(payload[0].name, payload).to.equal('fooGroup');
    });
  });
});
