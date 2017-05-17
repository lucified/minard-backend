import { expect, use } from 'chai';
import { Server } from 'hapi';
import 'reflect-metadata';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { getSignedAccessToken } from '../config/config-test';
import { RealtimeHapiPlugin } from '../realtime';
import { getTestServer } from '../server/hapi';
import { MethodStubber, stubber } from '../shared/test';
import TokenGenerator from '../shared/token-generator';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import { generateTeamToken } from './team-token';

const validAccessToken = getSignedAccessToken('idp|12345678', generateTeamToken(), 'foo@bar.com');
async function getServer(
  authenticationStubber: MethodStubber<AuthenticationHapiPlugin>,
) {
  const kernel = bootstrap('test');
  kernel.rebind(AuthenticationHapiPlugin.injectSymbol).to(AuthenticationHapiPlugin);
  kernel.rebind(RealtimeHapiPlugin.injectSymbol).to(RealtimeHapiPlugin);
  const plugin = stubber<RealtimeHapiPlugin>(
    p => sinon.stub(p, p.deploymentHandler.name)
        .yields(200)
        .returns(Promise.resolve(true)),
    RealtimeHapiPlugin.injectSymbol,
    kernel,
  );

  const authenticationPlugin = stubber(authenticationStubber, AuthenticationHapiPlugin.injectSymbol, kernel);
  const server = await getTestServer(true, authenticationPlugin.instance, plugin.instance);
  const tokenGenerator = kernel.get<TokenGenerator>(TokenGenerator.injectSymbol);

  return {
    server,
    authentication: authenticationPlugin.instance,
    tokenGenerator,
  };
}

function arrange(
  hasAccessToProject: boolean,
  isAdmin = false,
  isOpenDeployment = false,
) {
  return getServer(
    (p: AuthenticationHapiPlugin) => {
      return [
        sinon.stub(p, p.userHasAccessToProject.name)
          .returns(Promise.resolve(hasAccessToProject)),
        sinon.stub(p, p.isAdmin.name)
          .returns(Promise.resolve(isAdmin)),
        sinon.stub(p, p.isOpenDeployment.name)
          .returns(Promise.resolve(isOpenDeployment)),
        sinon.stub(p, p.getProjectTeam.name)
          .returns(Promise.resolve({id: 1, name: 'foo'})),
      ];
    },
  );
}

describe('authorization for deployment events', () => {
  describe('authenticated user', () => {
    function makeRequest(server: Server, token: string) {
      return server.inject({
        method: 'GET',
        url: `/events/deployment/1-1/${token}?token=${validAccessToken}`,
      });
    }
    it('should allow accessing authorized deployments', async () => {
      // Arrange
      const { server, authentication, tokenGenerator } = await arrange(true);
      // Act
      const response = await makeRequest(server, tokenGenerator.deploymentToken(1, 1));
      // Assert
      expect(response.statusCode, response.payload).to.eq(200);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should allow accessing open deployments', async () => {
      // Arrange
      const { server, authentication, tokenGenerator } = await arrange(true, false, true);
      // Act
      const response = await makeRequest(server, tokenGenerator.deploymentToken(1, 1));
      // Assert
      expect(response.statusCode).to.eq(200);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should not allow accessing unauthorized deployments', async () => {
      // Arrange
      const { server, authentication, tokenGenerator } = await arrange(false);
      // Act
      const response = await makeRequest(server, tokenGenerator.deploymentToken(1, 1));
      // Assert
      expect(response.statusCode).to.eq(404);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should not allow accessing when token is invalid', async () => {
      // Arrange
      const { server, authentication } = await arrange(true);
      // Act
      const response = await makeRequest(server, 'foobar');
      // Assert
      expect(response.statusCode).to.eq(403);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
  });
  describe('unauthenticated user', () => {
    function makeRequest(server: Server, token: string) {
      return server.inject({
        method: 'GET',
        url: `/events/deployment/1-1/${token}`,
      });
    }
    it('should not allow accessing non-open deployments', async () => {
      // Arrange
      const { server, tokenGenerator } = await arrange(false);
      // Act
      const response = await makeRequest(server, tokenGenerator.deploymentToken(1, 1));
      // Assert
      expect(response.statusCode, response.payload).to.eq(404);
    });
    it('should allow accessing open deployments', async () => {
      // Arrange
      const { server, tokenGenerator } = await arrange(false, false, true);
      // Act
      const response = await makeRequest(server, tokenGenerator.deploymentToken(1, 1));
      // Assert
      expect(response.statusCode).to.eq(200);
    });
    it('should not allow accessing when token is invalid', async () => {
      // Arrange
      const { server } = await arrange(false, false, true);
      // Act
      const response = await makeRequest(server, 'foobar');
      // Assert
      expect(response.statusCode).to.eq(403);
    });
  });
});

describe.skip('authorization for team events', () => {
  describe('authenticated user', () => {
    function makeRequest(server: Server) {
      return server.inject({
        method: 'GET',
        url: `/events/team/1`,
      });
    }
    it('should allow accessing authorized teams', async () => {
      // Arrange
      const { server, authentication } = await arrange(true);
      // Act
      const response = await makeRequest(server);
      // Assert
      expect(response.statusCode, response.payload).to.eq(200);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should allow accessing open teams', async () => {
      // Arrange
      const { server, authentication } = await arrange(true, false, true);
      // Act
      const response = await makeRequest(server);
      // Assert
      expect(response.statusCode).to.eq(200);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should not allow accessing unauthorized teams', async () => {
      // Arrange
      const { server, authentication } = await arrange(false);
      // Act
      const response = await makeRequest(server);
      // Assert
      expect(response.statusCode).to.eq(404);
      expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    });
  });
  describe('unauthenticated user', () => {
    function makeRequest(server: Server) {
      return server.inject({
        method: 'GET',
        url: `/events/team/1`,
      });
    }
    it('should not allow accessing non-open teams', async () => {
      // Arrange
      const { server } = await arrange(false);
      // Act
      const response = await makeRequest(server);
      // Assert
      expect(response.statusCode, response.payload).to.eq(404);
    });
    it('should not allow accessing open teams', async () => {
      // Arrange
      const { server } = await arrange(false, false, true);
      // Act
      const response = await makeRequest(server);
      // Assert
      expect(response.statusCode).to.eq(200);
    });
  });
});
