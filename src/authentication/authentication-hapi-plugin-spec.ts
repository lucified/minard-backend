import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { getAccessToken, issuer } from '../config/config-test';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { adminTeamNameInjectSymbol } from '../shared/types';
import AuthenticationHapiPlugin, { accessTokenCookieSettings, generatePassword } from './authentication-hapi-plugin';
import { generateAndSaveTeamToken, generateTeamToken, TeamToken, teamTokenLength } from './team-token';
import { getDb, insertTeamToken } from './team-token-spec';

const defaultTeamTokenString = generateTeamToken();
expect(defaultTeamTokenString.length).to.equal(teamTokenLength);
const defaultEmail = 'foo@bar.com';
const defaultSub = 'idp|12345678';

const validAccessToken = getAccessToken(defaultSub, defaultTeamTokenString, defaultEmail);
const invalidAccessToken = `${validAccessToken}a`;

const validTeamToken: TeamToken = {
  token: defaultTeamTokenString,
  teamId: 1,
  createdAt: moment.utc(),
};

async function getServer() {
  const plugin = get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
  const server = await getTestServer(plugin);
  return server;
}

describe('authentication-hapi-plugin', () => {

  describe('jwt verification', () => {

    it('should return 401 for missing and invalid tokens', async () => {
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
          'Authorization': `Bearer ${invalidAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);
    });
    it('should require a valid sub in the token', async () => {
      // Arrange
      const server = await getServer();

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${getAccessToken('abc')}`,
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
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(200);
    });
  });

  describe('team token endpoint', () => {
    it('should require admin team membership to get other teams\' tokens', async () => {
      // Arrange
      const server = await getServer();
      const teamId = 2;
      const adminTeamName = get<string>(adminTeamNameInjectSymbol);

      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: adminTeamName + '1',
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://foo.com/team-token/${teamId}`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);
    });
    it('should return the team token with GET and a teamId', async () => {
      // Arrange
      const server = await getServer();
      const teamId = 2;
      const adminTeamName = get<string>(adminTeamNameInjectSymbol);
      const db = await getDb();
      const token = await generateAndSaveTeamToken(teamId, db);
      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: adminTeamName,
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://foo.com/team-token/${teamId}`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(200);
      const result = JSON.parse(response.payload);
      expect(result.token).to.equal(token.token);

    });
    it('should allow fetching own team\'s token even if not admin', async () => {
      // Arrange
      const server = await getServer();
      const teamId = 2;
      const teamName = 'foofoo';
      const db = await getDb();
      const token = await generateAndSaveTeamToken(teamId, db);
      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id:  teamId,
        name: teamName,
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://foo.com/team-token`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(200);
      const result = JSON.parse(response.payload);
      expect(result.token).to.equal(token.token);

    });

    it('should return 404 if no token found', async () => {
      // Arrange
      const server = await getServer();
      const teamId = 23;
      const adminTeamName = get<string>(adminTeamNameInjectSymbol);

      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: adminTeamName,
      }]);
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/userinfo$/, {
        email: 'foo@bar.com',
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://foo.com/team-token/${teamId}`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(404);
    });
    it('should return a new token with POST', async () => {
      // Arrange
      const server = await getServer();
      const adminTeamName = get<string>(adminTeamNameInjectSymbol);

      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: adminTeamName,
      }]);

      // Act
      const response = await server.inject({
        method: 'POST',
        url: `http://foo.com/team-token/${adminTeamName}`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(201);
      const result = JSON.parse(response.payload);
      expect(result.token.length).to.equal(teamTokenLength);
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
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      try {
        const result = JSON.parse(response.payload);
        // Assert
        expect(result.id).to.equal(1);
        expect(result.name).to.equal('fooGroup');
      } catch (error) {
        expect.fail(response.payload);
      }
    });
  });

  describe('signup endpoint', () => {
    it('should create a gitlab user and add it to the specified group', async () => {
      // Arrange
      const db = await getDb();
      await insertTeamToken(db, validTeamToken);

      const server = await getServer();
      fetchMock.restore();
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/groups\/1/, {
        id: validTeamToken.teamId,
        name: 'fooGroup',
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/signup',
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.rawPayload.toString()).to.equal(201);
      const result = JSON.parse(response.payload);
      expect(result.team.id).to.equal(1);
      expect(result.password).to.exist;
    });
    it('should report the email on error', async () => {

      // Arrange
      // clear the db
      await getDb();

      const server = await getServer();
      fetchMock.restore();
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/groups/, [{
        id: validTeamToken.teamId + 1,
        name: 'fooGroup',
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/signup',
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.rawPayload.toString()).to.equal(400);
      const result = JSON.parse(response.payload);
      expect((result.message as string).indexOf(defaultEmail)).to.not.eq(-1);
    });
    it('should fall back to trying to retrieve the email from Auth0', async () => {
      // Arrange
      const db = await getDb();
      await insertTeamToken(db, validTeamToken);

      const server = await getServer();
      const invalidEmail = 'foo@';
      const userInfoEndpoint = `${issuer}/userinfo`;
      fetchMock.restore();
      fetchMock.get(userInfoEndpoint, {
        email: defaultEmail,
      });
      fetchMock.mock(/\/users/, [{
        id: 1,
      }]);
      fetchMock.mock(/\/groups/, [{
        id: validTeamToken.teamId,
        name: 'fooGroup',
      }]);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/signup',
        headers: {
          'Authorization': `Bearer ${getAccessToken(defaultSub, defaultTeamTokenString, invalidEmail)}`,
        },
      });

      // Assert
      expect(fetchMock.called(userInfoEndpoint), response.rawPayload.toString()).to.be.true;
      expect(response.statusCode, response.payload).to.equal(201);
    });
  });

  describe('generatePassword', () => {
    it('should return a string of 16 chars by default', () => {
      const password = generatePassword();
      expect(typeof password, password).to.equal('string');
      expect(password.length, password).to.equal(16);
    });
  });
  describe('cookie', () => {
    it('should be set with the access token as the value when accessing the team endpoint', async () => {
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
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });
      const cookie = response.headers['set-cookie'][0];
      const token = cookie.replace(/^token=([^;]+).*$/, '$1');
      expect(token).to.eq(validAccessToken);
    });
    it('should not accept an invalid externalBaseUrl', () => {
      const settings = () => accessTokenCookieSettings('htttp://foo.bar');
      expect(settings).to.throw();
    });
    it('should have isSecure flag set depending on externalBaseUrl', () => {
      const settings1 = accessTokenCookieSettings('http://foo.bar');
      const settings2 = accessTokenCookieSettings('https://foo.bar');

      expect(settings1.isSecure).to.be.false;
      expect(settings2.isSecure).to.be.true;

    });
    it('should have a domain parsed from externalBaseUrl and prepended with a dot', () => {
      const settings = accessTokenCookieSettings('http://foo.bar:8080/baz');
      expect(settings.domain).to.eq('.foo.bar');
    });
  });
});
