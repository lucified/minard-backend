import 'reflect-metadata';

import * as Boom from 'boom';
import { expect, use } from 'chai';
import { Container } from 'inversify';
import * as Knex from 'knex';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { getAccessToken, getSignedAccessToken } from '../config/config-test';
import { getTestServer } from '../server/hapi';
import { makeRequestWithAuthentication, MethodStubber, stubber } from '../shared/test';
import { adminTeamNameInjectSymbol, charlesKnexInjectSymbol, openTeamNamesInjectSymbol } from '../shared/types';
import {
  accessTokenCookieSettings,
  default as AuthenticationHapiPlugin,
  generatePassword,
  sanitizeSubClaim,
} from './authentication-hapi-plugin';
import { generateAndSaveTeamToken, generateTeamToken, teamTokenLength } from './team-token';
import { initializeTeamTokenTable } from './team-token-spec';
import { AuthorizationStatus, RequestCredentials } from './types';

const defaultTeamTokenString = generateTeamToken();
expect(defaultTeamTokenString.length).to.equal(teamTokenLength);
const defaultEmail = 'foo@bar.com';
const defaultSub = 'auth0|12345678';

const validAccessToken = getSignedAccessToken(defaultSub, defaultTeamTokenString, defaultEmail);
const invalidAccessToken = `${validAccessToken}a`;
const makeRequest = makeRequestWithAuthentication(validAccessToken);

async function getPlugin(authenticationStubber?: MethodStubber<AuthenticationHapiPlugin>) {
  const kernel = bootstrap('test');
  kernel.rebind(AuthenticationHapiPlugin.injectSymbol).to(AuthenticationHapiPlugin);
  const db = kernel.get<Knex>(charlesKnexInjectSymbol);
  kernel.rebind(charlesKnexInjectSymbol).toConstantValue(db);
  kernel.rebind(openTeamNamesInjectSymbol).toConstantValue(['fooopenteam', 'baropenteam']);
  await initializeTeamTokenTable(db);
  if (authenticationStubber) {
    const { instance } = stubber(authenticationStubber, AuthenticationHapiPlugin.injectSymbol, kernel);
    return { plugin: instance, db };
  }
  const plugin = kernel.get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
  return { plugin, db, kernel };
}

async function getServer(authenticationStubber?: MethodStubber<AuthenticationHapiPlugin>) {
  const { plugin, db } = await getPlugin(authenticationStubber);
  return {
    server: await getTestServer(true, plugin),
    plugin,
    db,
  };
}

describe('authentication-hapi-plugin', () => {

  describe('jwt verification', () => {

    it('should return 401 for missing and invalid tokens', async () => {
      // Arrange
      const { server } = await getServer();

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
      const { server } = await getServer();

      // Act
      const response = await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${getSignedAccessToken('abc')}`,
        },
      });

      // Assert
      expect(response.statusCode, response.payload).to.equal(401);
    });
    it('should call the route handler when the token is valid', async () => {
      // Arrange
      const { server, plugin } = await getServer(
        p => sinon.stub(p, 'getTeamHandler')
          .yields(200)
          .returns(Promise.resolve(true)),
      );

      // Act
      await server.inject({
        method: 'GET',
        url: 'http://foo.com/team',
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(plugin.getTeamHandler).to.have.been.calledOnce;
    });

  });

  describe('team token endpoint', () => {

    it('should be able to fetch caller\'s teams\' token', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin, db } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );
      const token = await generateAndSaveTeamToken(callerTeamId, db);

      // Act
      const response = await makeRequest(server, `/team-token/${callerTeamId}`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin.isAdmin).to.have.been.calledOnce;
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const json = JSON.parse(response.payload);
      expect(json.token).to.eq(token!.token);

    });
    it('should default to fetching caller\'s team\'s token', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin, db } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );
      const token = await generateAndSaveTeamToken(callerTeamId, db);

      // Act
      const response = await makeRequest(server, `/team-token`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin.isAdmin).to.have.been.calledOnce;
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const json = JSON.parse(response.payload);
      expect(json.token).to.eq(token!.token);

    });
    it('should not allow fetcing other teams\' tokens if not admin', async () => {
      // Arrange
      const callerTeamId = 1;
      const otherTeamId = 2;
      const { server, plugin, db } = await getServer(
        p => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );
      await generateAndSaveTeamToken(callerTeamId, db);

      // Act
      const response = await makeRequest(server, `/team-token/${otherTeamId}`);

      // Assert
      expect(response.statusCode).to.eq(401);
      expect(plugin.isAdmin).to.have.been.calledOnce;
      expect(plugin._getUserGroups).to.have.been.calledOnce;

    });
    it('should allow fetcing other teams\' tokens if admin', async () => {
      // Arrange
      const callerTeamId = 1;
      const otherTeamId = 2;
      const { server, plugin, db } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(true)),
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );
      const token = await generateAndSaveTeamToken(otherTeamId, db);

      // Act
      const response = await makeRequest(server, `/team-token/${otherTeamId}`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin.isAdmin).to.have.been.calledOnce;
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const json = JSON.parse(response.payload);
      expect(json.token).to.eq(token!.token);

    });
    it('should return 404 if no token found', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );

      // Act
      const response = await makeRequest(server, `/team-token`);

      // Assert
      expect(response.statusCode).to.eq(404);
      expect(plugin.isAdmin).to.have.been.calledOnce;
      expect(plugin._getUserGroups).to.have.been.calledOnce;

    });
  });
  describe('team endpoint', () => {
    it('should be able to fetch caller\'s team', async () => {
      // Arrange
      const callerTeamId = 1;
      const callerTeamName = 'teamname';
      const callerTeamDescription = 'team description';
      const { server, plugin } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{
              id: callerTeamId,
              name: callerTeamName,
              description: callerTeamDescription,
            }])),
        ],
      );

      // Act
      const response = await makeRequest(server, `/team`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const team = JSON.parse(response.payload);
      expect(team.id).to.eq(callerTeamId);
      expect(team.name).to.eq(callerTeamName);
      expect(team.description).to.eq(callerTeamDescription);
    });

    it('should return the team\'s teamToken', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin, db } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );

      const teamTokenObject = await generateAndSaveTeamToken(callerTeamId, db);

      // Act
      const response = await makeRequest(server, `/team`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const team = JSON.parse(response.payload);
      expect(team['invitation-token']).to.eq(teamTokenObject.token);
    });

    it('should return undefined as the teamToken if one doesn\'t exist', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );

      // Act
      const response = await makeRequest(server, `/team`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const team = JSON.parse(response.payload);
      expect(team['invitation-token']).to.be.undefined;
    });

    it('should not leak information from GitLab', async () => {
      // Arrange
      const callerTeamId = 1;
      const { server, plugin } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{
              id: callerTeamId,
              name: 'foo',
              web_url: 'http://test.com',
              visibility_level: 0,
            }])),
        ],
      );

      // Act
      const response = await makeRequest(server, `/team`);

      // Assert
      expect(response.statusCode).to.eq(200);
      expect(plugin._getUserGroups).to.have.been.calledOnce;
      const team = JSON.parse(response.payload);
      expect(team.id).to.eq(callerTeamId);
      expect(team.web_url).to.not.exist;
      expect(team.visibility_level).to.not.exist;
    });
  });

  describe('signup endpoint', () => {
    it('should be able to create a gitlab user and add it to the group specified in the access token', async () => {
      // Arrange
      const callerTeamId = 12;
      const { server, plugin, db } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getGroup')
            .returns(Promise.resolve({ id: callerTeamId, name: 'foo' })),
          sinon.stub(p, '_createUser')
            .returns(Promise.resolve({ id: 1, name: 'foo' })),
          sinon.stub(p, '_addUserToGroup')
            .returns(Promise.resolve(true)),
        ],
      );
      const teamToken = await generateAndSaveTeamToken(callerTeamId, db);
      const accessToken = getSignedAccessToken(defaultSub, teamToken.token, defaultEmail);

      // Act
      const response = await makeRequestWithAuthentication(accessToken)(server, `/signup`);

      // Assert
      expect(response.statusCode).to.eq(201);
      expect(plugin._getGroup).to.have.been.calledOnce;
      expect(plugin._createUser).to.have.been.calledOnce;
      expect(plugin._addUserToGroup).to.have.been.calledOnce;
      const json = JSON.parse(response.payload);
      expect(json.team.id).to.eq(callerTeamId);
      expect(json.password).to.exist;

    });
    it('should report the email on error', async () => {
      // Arrange
      const callerTeamId = 12;
      const { server } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getGroup')
            .returns(Promise.resolve({ id: callerTeamId, name: 'foo' })),
          sinon.stub(p, '_createUser')
            .returns(Promise.resolve({ id: 1, name: 'foo' })),
          sinon.stub(p, '_addUserToGroup')
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const response = await makeRequest(server, `/signup`);

      // Assert
      expect(response.statusCode, response.rawPayload.toString()).to.equal(400);
      const result = JSON.parse(response.payload);
      expect((result.message as string).indexOf(defaultEmail)).to.not.eq(-1);

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
      // Arrange
      const callerTeamId = 1;
      const { server } = await getServer(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
        ],
      );

      // Act
      const response = await makeRequest(server, `/team`);

      // Assert
      const cookie = response.headers['set-cookie'][0];
      const token = cookie.replace(/^token=([^;]+).*$/, '$1');
      expect(token).to.eq(validAccessToken);
    });
    it('should not accept an invalid url', () => {
      const settings = () => accessTokenCookieSettings('htttp://foo.bar');
      expect(settings).to.throw();
    });
    it('should have isSecure flag set depending on url', () => {
      const settings1 = accessTokenCookieSettings('http://foo.bar');
      const settings2 = accessTokenCookieSettings('https://foo.bar');

      expect(settings1.isSecure).to.be.false;
      expect(settings2.isSecure).to.be.true;

    });
    it('should have the domain parsed from url and prepended with a dot', () => {
      const settings = accessTokenCookieSettings('http://foo.bar:8080');
      expect(settings.domain).to.eq('.foo.bar');
      expect(settings.path).to.eq('/');
    });
    it('should have the path parsed from url', () => {
      const settings = accessTokenCookieSettings('http://foo.bar:8080/baz');
      expect(settings.path).to.eq('/baz');
    });
    it('should accept a non-url domain', () => {
      const settings = accessTokenCookieSettings('.foo.bar');
      expect(settings.domain).to.eq('.foo.bar');
      expect(settings.path).to.eq('/');
    });
  });
  describe('_userHasAccessToTeam', () => {
    it('returns true when matching team is found', async () => {

      // Arrange
      const callerTeamId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId, name: 'foo' }])),
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const result = await plugin._userHasAccessToTeam('foo', callerTeamId);

      // Assert
      expect(result).to.be.true;
    });
    it('returns false when matching team is not found', async () => {

      // Arrange
      const callerTeamId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: callerTeamId + 1, name: 'foo' }])),
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const result = await plugin._userHasAccessToTeam('foo', callerTeamId);

      // Assert
      expect(result).to.be.false;
    });
    it('returns true if caller is an admin', async () => {

      // Arrange
      const callerTeamId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin._userHasAccessToTeam('foo', callerTeamId);

      // Assert
      expect(result).to.be.true;
    });
    it('throws if something unexpected happens', async () => {

      // Arrange
      const callerTeamId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.reject(Boom.badGateway())),
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const resultPromise = plugin._userHasAccessToTeam('foo', callerTeamId);

      // Assert
      return resultPromise
        .then(_ => expect.fail(), error => expect(error.isBoom).to.be.true);
    });
  });
  describe('_userHasAccessToProject', () => {
    it('returns true if the Promise resolves', async () => {

      // Arrange
      const projectId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getProject')
            .returns(Promise.resolve(1)),
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const result = await plugin._userHasAccessToProject('foo', projectId);

      // Assert
      expect(result).to.be.true;
    });
    it('throws if the Promise is rejected', async () => {

      // Arrange
      const projectId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getProject')
            .returns(Promise.reject(Boom.notFound())),
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const resultPromise = plugin._userHasAccessToProject('foo', projectId);

      // Assert
      return resultPromise
        .then(_ => expect.fail(), error => expect(error.isBoom).to.be.true);

    });
    it('returns true if caller is an admin', async () => {

      // Arrange
      const projectId = 1;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, 'isAdmin')
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin._userHasAccessToProject('foo', projectId);

      // Assert
      expect(result).to.be.true;
    });
  });
  describe('userHasAccessToDeployment', () => {
    it('returns true when the caller is already authorized and the deployment is not open', async () => {

      // Arrange
      const status = AuthorizationStatus.AUTHORIZED;
      const { plugin } = await getPlugin();

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1, getRequestCredentials(status));

      // Assert
      expect(result).to.be.true;
    });
    it('returns true when the caller is already authorized and the deployment is open', async () => {

      // Arrange
      const status = AuthorizationStatus.AUTHORIZED;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1, getRequestCredentials(status));

      // Assert
      expect(result).to.be.true;
    });
    it('returns true when the caller is not yet authorized but has access to project', async () => {

      // Arrange
      const status = AuthorizationStatus.NOT_CHECKED;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p._userHasAccessToProject.name)
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1, getRequestCredentials(status));

      // Assert
      expect(result).to.be.true;
      expect(plugin._userHasAccessToProject).to.have.been.calledOnce;
    });

    it('returns true when the caller is not authorized but the deployment is open', async () => {

      // Arrange
      const status = AuthorizationStatus.UNAUTHORIZED;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1, getRequestCredentials(status));

      // Assert
      expect(result).to.be.true;
      expect(plugin.isOpenDeployment).to.have.been.calledOnce;
    });

    it('returns true when no credentials are provided but the deployment is open', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(true)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1);

      // Assert
      expect(result).to.be.true;
      expect(plugin.isOpenDeployment).to.have.been.calledOnce;
    });

    it('returns false when the caller is not authorized and the deployment is not open', async () => {

      // Arrange
      const status = AuthorizationStatus.UNAUTHORIZED;
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1, getRequestCredentials(status));

      // Assert
      expect(plugin.isOpenDeployment).to.have.been.calledOnce;
      expect(result).to.be.false;
    });

    it('returns false when no credentials are provided and the deployment is not open', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(false)),
        ],
      );

      // Act
      const result = await plugin.userHasAccessToDeployment(1, 1);

      // Assert
      expect(result).to.be.false;
      expect(plugin.isOpenDeployment).to.have.been.calledOnce;
    });

  });
  describe('_isAdmin', () => {
    it('returns true if the user belongs to a team with the correct name', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin, k: Container) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: 1, name: k.get<string>(adminTeamNameInjectSymbol) }])),
        ],
      );

      // Act
      const result = await plugin._isAdmin('foo');

      // Assert
      expect(result).to.be.true;
    });
    it('returns false if the user belongs to a team with an incorrect name', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin, k: Container) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.resolve([{ id: 1, name: k.get<string>(adminTeamNameInjectSymbol) + '1' }])),
        ],
      );

      // Act
      const result = await plugin._isAdmin('foo');

      // Assert
      expect(result).to.be.false;
    });
    it('throws if something unexpected happens', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, '_getUserGroups')
            .returns(Promise.reject(Boom.badGateway())),
        ],
      );

      // Act
      const resultPromise = plugin._isAdmin('foo');

      // Assert
      return resultPromise
        .then(_ => expect.fail(), error => expect(error.isBoom).to.be.true);
    });
  });
  describe('isOpenDeployment', () => {
    it('returns true if the project belongs to an \'open\' team', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin, k: Container) => {
          const openTeamName = k.get<string[]>(openTeamNamesInjectSymbol)[0];

          return [
            sinon.stub(p, p.getProjectTeam.name)
              .returns(Promise.resolve({ name: openTeamName, id: 1 })),
          ];
        },
      );

      // Act
      const result = await plugin.isOpenDeployment(1, 1);

      // Assert
      expect(result).to.be.true;
    });
    it('returns true if the project belongs to the second \'open\' team', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin, k: Container) => {
          const openTeamName = k.get<string[]>(openTeamNamesInjectSymbol)[1];

          return [
            sinon.stub(p, p.getProjectTeam.name)
              .returns(Promise.resolve({ name: openTeamName, id: 1 })),
          ];
        },
      );

      // Act
      const result = await plugin.isOpenDeployment(1, 1);

      // Assert
      expect(result).to.be.true;
    });
    it('returns false if the project doesn\'t belong to an \'open\' team', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin, _k: Container) => {
          const notOpenTeamName = 'notopenteamname';

          return [
            sinon.stub(p, p.getProjectTeam.name)
              .returns(Promise.resolve({ name: notOpenTeamName, id: 1 })),
          ];
        },
      );

      // Act
      const result = await plugin.isOpenDeployment(1, 1);

      // Assert
      expect(result).to.be.false;
    });
    it('throws if something unexpected happens', async () => {

      // Arrange
      const { plugin } = await getPlugin(
        (p: AuthenticationHapiPlugin) => [
          sinon.stub(p, p.getProjectTeam.name)
            .returns(Promise.reject(Boom.badGateway())),
        ],
      );

      // Act
      const resultPromise = plugin.isOpenDeployment(1, 1);

      // Assert
      return resultPromise
        .then(_ => expect.fail(), error => expect(error.isBoom).to.be.true);
    });
  });
  describe('sanitizeSubClaim', () => {
    it('sanitizes regular sub claims', async () => {

      // Arrange
      const sub = 'auth0|foo';

      // Act
      const sanitized = sanitizeSubClaim(sub);

      // Assert
      expect(sanitized).to.eq('auth0-foo');
    });
    it('sanitizes non-interactive sub claims', async () => {

      // Arrange
      const sub = 'foo@clients';

      // Act
      const sanitized = sanitizeSubClaim(sub);

      // Assert
      expect(sanitized).to.eq('clients-foo');
    });
    it('throws is not correct format', async () => {

      // Arrange
      const case1 = () => sanitizeSubClaim('foo');
      const case2 = () => sanitizeSubClaim('1foo');
      const case3 = () => sanitizeSubClaim('auth0foo|43dfdfg');
      const case4 = () => sanitizeSubClaim('clients@234234');

      // Assert
      expect(case1).to.throw;
      expect(case2).to.throw;
      expect(case3).to.throw;
      expect(case4).to.throw;
    });

  });
});

function getRequestCredentials(authorizationStatus: AuthorizationStatus): RequestCredentials {
  return {
    ...getAccessToken('foo|123123'),
    authorizationStatus,
  };
}
