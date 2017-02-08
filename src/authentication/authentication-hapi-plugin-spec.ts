import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { getAccessToken, issuer } from '../config/config-development';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { adminTeamNameInjectSymbol } from '../shared/types';
import AuthenticationHapiPlugin, { generatePassword } from './authentication-hapi-plugin';
import { generateAndSaveTeamToken, TeamToken, teamTokenLength } from './team-token';
import { getDb, insertTeamToken } from './team-token-spec';

const defaultTeamTokenString = '1111222233334444';
expect(defaultTeamTokenString.length).to.equal(teamTokenLength);
const defaultEmail = 'foo@bar.com';

const validAccessToken = getAccessToken(defaultTeamTokenString, defaultEmail);
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
    it('should require a valid email in the token', async () => {
      // Arrange
      const server = await getServer();
      const invalidEmail = 'foo@';
      fetchMock.restore();
      fetchMock.get('*', 404);

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${getAccessToken(defaultTeamTokenString, invalidEmail)}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);
    });
    it('should fall back to trying to retrieve the email from Auth0', async () => {
      // Arrange
      const server = await getServer();
      const invalidEmail = 'foo@';
      const userInfoEndpoint = `${issuer}/userinfo`;
      fetchMock.restore();
      fetchMock.get(userInfoEndpoint, {
        email: invalidEmail,
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${getAccessToken(defaultTeamTokenString, invalidEmail)}`,
        },
      });

      // Assert
      expect(fetchMock.called(userInfoEndpoint)).to.be.true;
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
    it('should require admin team membership', async () => {
      // Arrange
      const server = await getServer();
      const teamId = 2;
      const adminTeamName = get<string>(adminTeamNameInjectSymbol);

      fetchMock.restore();
      fetchMock.mock(/\/groups/, [{
        id: 1,
        name: adminTeamName + '1',
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
      expect(response.statusCode, response.payload).to.equal(401);
    });
    it('should return the team token with GET', async () => {
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
      const teamId = 24;
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
        method: 'POST',
        url: `http://foo.com/team-token/${teamId}`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).to.equal(201);
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

      const result = JSON.parse(response.payload);
      // Assert
      expect(result.id).to.equal(1);
      expect(result.name).to.equal('fooGroup');
    });
  });

  describe('signup endpoint', () => {
    it('should report the email on error', async () => {
      // Arrange
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
    it('should create a gitlab user and add it to the specified group', async () => {
      // Arrange
      const db = await getDb();
      await insertTeamToken(db, validTeamToken);

      const server = await getServer();
      fetchMock.restore();
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
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode, response.rawPayload.toString()).to.equal(201);
      const result = JSON.parse(response.payload);
      expect(result.team.id).to.equal(1);
      expect(result.password).to.exist;
    });
  });

  describe('generatePassword', () => {
    it('should return a string of 16 chars by default', () => {
      const password = generatePassword();
      expect(typeof password, password).to.equal('string');
      expect(password.length, password).to.equal(16);
    });
  });
});
