import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  default as AuthenticationHapiPlugin,
  getUserByEmail,
  getUserTeams,
  TeamToken,
  validateTeamToken,
} from './authentication-hapi-plugin';

const validToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik1URkNSVVEzT0VFd09FVXlPRVF3UTBJd0
5USTJSVGhGTlRCR1JUWkNRa0kwUXpVM1JUaEdOQSJ9.eyJpc3MiOiJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDU4OTg5ZmU2YjBlOGMwMGY3NGIzYTI3ZCIsImF1ZCI6WyJodHRwczovL2NoYXJsZXMtc3RhZ2luZy5taW5hcmQuaW8iLCJodHRwczovL2x1Y2lmeS1kZXYuZXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImF6cCI6IlphZWlOeVY3UzdNcEk2OWNLTkhyOHdYZTVCZHI4dHZXIiwiZXhwIjoxNDg2NDgzODE1LCJpYXQiOjE0ODYzOTc0MTUsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.HPmlETaFONwU-l30WwTAJEC89uywiXtc_-1c2ltXhVMcqkhjkyymP1W50i7aS44NeD-3rJho5I7p_cVcRrg77Le-t8Bu7TzaPHBmhu9YECONXp0Y1Yq_0b2y9klhbQrSshQ6Cu90JRTfs5JGd5EhesAyHHFf6tLkPNBWoNEUkWBWwJQpowwpKVGBY-7h_54foO2GsPwyDN8MJo84xV_0D8myFt08X5j97y-go1HszumSgyC2k4ANgU4yYvUDahOSQKo8RyboyM8UZbb55SxahWUjQxq-E4coLiiEf0_MjZANhvGJHCN6bTXbl1aY9s5OL7inJiqNgqmLjiq-0lRQSg`.replace(/\s|[^\x20-\x7E]/gmi, ''); // tslint:disable-line

const invalidToken = validToken.replace(/u/gim, 'i');

async function getServer() {
  const plugin = get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
  const server = await getTestServer(plugin);
  return server;
}

const validTokens: TeamToken[] = [
  {
    token: 'abcd123',
    teamId: 1,
    createdAt: moment.utc(),
  },
  {
    token: 'abcd124',
    teamId: 1,
    createdAt: moment.utc().subtract(5, 'days'),
  },
  {
    token: 'abcd125',
    teamId: 2,
    createdAt: moment.utc(),
  },
  {
    token: 'abcd126',
    teamId: 2,
    createdAt: moment.utc().subtract(5, 'days'),
  },
];

async function getDb() {
  const db = get<Knex>(charlesKnexInjectSymbol);
  await db.migrate.latest({
    directory: 'migrations/authentication',
  });
  return db;
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

  describe.only('validateTeamToken', () => {

    it('should return the latest token per team', async () => {
      const db = await getDb();
      const toDb = (token: TeamToken) => ({...token, createdAt: token.createdAt.valueOf()});
      await Promise.all(validTokens.map(item => db('teamtoken').insert(toDb(item))));
      let teamId = await validateTeamToken(validTokens[0].token, db);
      expect(teamId).to.eq(validTokens[0].teamId);
      teamId = await validateTeamToken(validTokens[2].token, db);
      expect(teamId).to.eq(validTokens[2].teamId);
    });
    it('should not accept nonexistent or invalidated tokens', async () => {
      const db = await getDb();
      const toDb = (token: TeamToken) => ({...token, createdAt: token.createdAt.valueOf()});
      await Promise.all(validTokens.map(item => db('teamtoken').insert(toDb(item))));

      const exceptions: Error[] = [];
      try {
        await validateTeamToken(validTokens[1].token, db);
      } catch (err) {
        exceptions.push(err);
      }
      expect(exceptions.length).to.eq(1);
      try {
        await validateTeamToken(validTokens[3].token, db);
      } catch (err) {
        exceptions.push(err);
      }
      expect(exceptions.length).to.eq(2);
      try {
        await validateTeamToken(validTokens[0].token.replace('1', '8'), db);
      } catch (err) {
        exceptions.push(err);
      }
      expect(exceptions.length).to.eq(3);
    });
  });
});
