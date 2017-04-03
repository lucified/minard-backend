import { expect, use } from 'chai';
import { Server } from 'hapi';
import 'reflect-metadata';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { getAccessToken } from '../config/config-test';
import { DeploymentHapiPlugin } from '../deployment';
import { getTestServer } from '../server/hapi';
import { MethodStubber, stubber } from '../shared/test';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import { generateTeamToken } from './team-token';

const validAccessToken = getAccessToken('idp|12345678', generateTeamToken(), 'foo@bar.com');
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
  const handlerStub = sinon.stub().yields(200);
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

type AuthorizationMethod = 'userHasAccessToProject' | 'userHasAccessToTeam';

function arrange(
  authorizationMethod: AuthorizationMethod,
  hasAccess: boolean,
) {
  return getServer(
    p => [
      sinon.stub(p, authorizationMethod)
        .returns(Promise.resolve(hasAccess)),
      sinon.stub(p, 'isAdmin')
        .returns(Promise.resolve(false)),
    ],
    p => [
      sinon.stub(p, 'preCheck')
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
      'Authorization': `Bearer ${validAccessToken}`,
    },
  });
}
describe('authorization for raw deployments', () => {
  it('should allow accessing authorized deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange('userHasAccessToProject', true);
    // Act
    const response = await makeRequest(server);
    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    expect(handlerStub).to.have.been.calledOnce;
  });
  it('should not allow accessing unauthorized deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange('userHasAccessToProject', false);
    // Act
    const response = await makeRequest(server);
    // Assert
    expect(response.statusCode).to.eq(401);
    expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    expect(handlerStub).to.not.have.been.called;

  });
  it('should redirect to login screen for unauthenticated deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange('userHasAccessToProject', true);
    // Act
    const response = await server.inject({
      method: 'GET',
      url: validDeploymentUrl,
    });
    // Assert
    expect(response.statusCode).to.eq(302);
    expect(authentication.userHasAccessToProject).to.not.have.been.called;
    expect(handlerStub).to.not.have.been.called;
  });
});
