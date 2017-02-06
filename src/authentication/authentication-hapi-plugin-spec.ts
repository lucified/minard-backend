import { expect } from 'chai';
import 'reflect-metadata';

import { get } from '../config';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { adminTeamNameInjectSymbol } from '../shared/types';
import { default as AuthenticationHapiPlugin, generatePassword } from './authentication-hapi-plugin';
import { generateTeamToken, teamTokenLength } from './team-token';
import { getDb } from './team-token-spec';

const validToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik1URkNSVVEzT0VFd09FVXlPRVF3UTBJd0
5USTJSVGhGTlRCR1JUWkNRa0kwUXpVM1JUaEdOQSJ9.eyJpc3MiOiJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDU4OTg5ZmU2YjBlOGMwMGY3NGIzYTI3ZCIsImF1ZCI6WyJodHRwczovL2NoYXJsZXMtc3RhZ2luZy5taW5hcmQuaW8iLCJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImF6cCI6IlphZWlOeVY3UzdNcEk2OWNLTkhyOHdYZTVCZHI4dHZXIiwiZXhwIjoxNDg2NDgzODE1LCJpYXQiOjE0ODYzOTc0MTUsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.HPmlETaFONwU-l30WwTAJEC89uywiXtc_-1c2ltXhVMcqkhjkyymP1W50i7aS44NeD-3rJho5I7p_cVcRrg77Le-t8Bu7TzaPHBmhu9YECONXp0Y1Yq_0b2y9klhbQrSshQ6Cu90JRTfs5JGd5EhesAyHHFf6tLkPNBWoNEUkWBWwJQpowwpKVGBY-7h_54foO2GsPwyDN8MJo84xV_0D8myFt08X5j97y-go1HszumSgyC2k4ANgU4yYvUDahOSQKo8RyboyM8UZbb55SxahWUjQxq-E4coLiiEf0_MjZANhvGJHCN6bTXbl1aY9s5OL7inJiqNgqmLjiq-0lRQSg`.replace(/\s|[^\x20-\x7E]/gmi, ''); // tslint:disable-line

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
      expect(result.token).to.equal(token);

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
      expect(response.payload.length).to.equal(teamTokenLength);
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
