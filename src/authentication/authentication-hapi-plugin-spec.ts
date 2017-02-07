import { expect } from 'chai';
import 'reflect-metadata';

import { get } from '../config';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { adminTeamNameInjectSymbol } from '../shared/types';
import { default as AuthenticationHapiPlugin, generatePassword } from './authentication-hapi-plugin';
import { generateTeamToken, teamTokenLength } from './team-token';
import { getDb } from './team-token-spec';

const validToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik1URkNSVVEzT0VFd09FVXlPRVF3UTBJd05USTJSVGhGTlRCR1JUWkNRa0kwUXpVM1JUaEdOQSJ9.eyJpc3MiOiJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDU4OTg5ZmU2YjBlOGMwMGY3NGIzYTI3ZCIsImF1ZCI6WyJodHRwczovL2NoYXJsZXMtc3RhZ2luZy5taW5hcmQuaW8iLCJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImF6cCI6IlphZWlOeVY3UzdNcEk2OWNLTkhyOHdYZTVCZHI4dHZXIiwiZXhwIjoxNDg2NDkxMTM0LCJpYXQiOjE0ODY0MDQ3MzQsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.t0202VbqxOAxpJjnUJxk8s6mJ4s7gZY3uYgO4fKEAxW7eHC4AXmG_H4zm4_DOSoPi1QyTO3tJ2eQetJBy8O8DKWxdcOVbIoIqf9N5ToCSE2luT31P_71Ip5a24_BryZHo8E453OnUkeXhlni8wILNgnS--NONz5ipAmQsaovNv8E7jSRsh5UcCP46RiuSwhqBdFrpCjmAxmd_P2uRpxil0CiarwaY232RWbecNw1a6CUCQSDnge-5Ipyw5nt_fzm8P7nsZcpYcHuhhVS8y2Sd-E_GzVYNfRUDG5eluwCAMf4cAlSbZIQ1zjCHDSsOIC9lx0mK2Uh-eLQ7bopj5H2zg`.replace(/\s|[^\x20-\x7E]/gmi, ''); // tslint:disable-line

const invalidToken = validToken.replace(/u/gim, 'i');

async function getServer() {
  const plugin = get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
  const server = await getTestServer(plugin);
  return server;
}

describe('authentication-hapi-plugin', () => {

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
      fetchMock.mock(/\/userinfo$/, {
        email: 'foo@bar.com',
      });
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
          'Authorization': `Bearer ${validToken}`,
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
      const token = await generateTeamToken(teamId, db);

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
          'Authorization': `Bearer ${validToken}`,
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
          'Authorization': `Bearer ${validToken}`,
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
          'Authorization': `Bearer ${validToken}`,
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
      fetchMock.mock(/\/userinfo$/, {
        email: 'foo@bar.com',
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${validToken}`,
        },
      });

      const result = JSON.parse(response.payload);
      // Assert
      expect(result.id).to.equal(1);
      expect(result.name).to.equal('fooGroup');
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
