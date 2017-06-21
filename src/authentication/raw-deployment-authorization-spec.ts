import { expect, use } from 'chai';
import { Server } from 'hapi';
import 'reflect-metadata';
import { stub } from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { getSignedAccessToken } from '../config/config-test';
import { DeploymentHapiPlugin } from '../deployment';
import { getTestServer } from '../server/hapi';
import { MethodStubber, stubber } from '../shared/test';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import { generateTeamToken } from './team-token';

const validAccessToken = getSignedAccessToken('auth0|12345678', generateTeamToken(), 'foo@bar.com');
const deploymentDomain = 'deployment.foo.com';
const validDeploymentUrl = `http://master-abcdef-1-1.${deploymentDomain}`;
async function getServer(
  authenticationStubber: MethodStubber<AuthenticationHapiPlugin>,
  plugin: MethodStubber<DeploymentHapiPlugin>,
) {
  const kernel = bootstrap('test');
  kernel.rebind(AuthenticationHapiPlugin.injectSymbol).to(AuthenticationHapiPlugin);
  kernel.rebind(DeploymentHapiPlugin.injectSymbol).to(DeploymentHapiPlugin);
  const authenticationPlugin = stubber(authenticationStubber, AuthenticationHapiPlugin.injectSymbol, kernel);
  const deploymentPlugin = stubber(plugin, DeploymentHapiPlugin.injectSymbol, kernel);
  const server = await getTestServer(false, authenticationPlugin.instance);
  const handlerStub = stub().yields(200);
  server.handler('directory', (_route, _options) => handlerStub);
  await server.register(deploymentPlugin.instance);
  await server.initialize();
  return {
    server,
    authentication: authenticationPlugin.instance,
    plugin: deploymentPlugin.instance,
    handlerStub,
  };
}

function arrange(
  hasAccess: boolean,
  isOpenDeployment = false,
) {
  return getServer(
    (p: AuthenticationHapiPlugin) => {
        return [
          stub(p, p.userHasAccessToDeployment.name)
            .returns(Promise.resolve(hasAccess)),
          stub(p, p.isAdmin.name)
            .returns(Promise.resolve(false)),
          stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(isOpenDeployment)),
        ];
    },
    (p: DeploymentHapiPlugin) => [
      stub(p, p.checkDeploymentPre.name)
        .yields(200)
        .returns(Promise.resolve(true)),
    ],
  );
}

function makeRequest(server: Server) {
  return server.inject({
    method: 'GET',
    url: validDeploymentUrl,
    headers: {
      'Cookie': `token=${validAccessToken}`,
    },
  });
}
describe('authorization for raw deployments', () => {
  it('should allow accessing authorized deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange(true);
    // Act
    const response = await makeRequest(server);
    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.have.been.calledOnce;
  });
  it('should not allow accessing unauthorized deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange(false);
    // Act
    const response = await makeRequest(server);
    // Assert
    expect(response.statusCode).to.eq(404);
    expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.not.have.been.called;

  });
  it('should redirect to login screen for unauthenticated deployment requests', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange(false);
    // Act
    const response = await server.inject({
      method: 'GET',
      url: validDeploymentUrl,
    });
    // Assert
    expect(response.statusCode).to.eq(302);
    expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.not.have.been.called;
  });
  it('should allow authorized access to open deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange(true, true);
    // Act
    const response = await makeRequest(server);

    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.have.been.calledOnce;
  });
  it('should allow open access to open deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange(true, true);
    // Act
    const response = await server.inject({
      method: 'GET',
      url: validDeploymentUrl,
    });
    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.have.been.calledOnce;
  });
});
