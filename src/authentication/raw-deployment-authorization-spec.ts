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

type AuthorizationMethod = 'userHasAccessToProject' | 'userHasAccessToTeam' | 'isOpenDeployment';

function arrange(
  authorizationMethod: AuthorizationMethod,
  hasAccess: boolean,
) {
  return getServer(
    p => {
      if (authorizationMethod === 'isOpenDeployment') {
        return [
          sinon.stub(p, authorizationMethod)
            .returns(Promise.resolve(hasAccess)),
          sinon.stub(p, p.isAdmin.name)
            .returns(Promise.resolve(false)),
        ];
      } else {
        return [
          sinon.stub(p, authorizationMethod)
            .returns(Promise.resolve(hasAccess)),
          sinon.stub(p, p.isAdmin.name)
            .returns(Promise.resolve(false)),
          sinon.stub(p, p.isOpenDeployment.name)
            .returns(Promise.resolve(false)),
        ];
      }
    },
    p => [
      sinon.stub(p, p.checkDeploymentPre.name)
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
    const { server, authentication, handlerStub } = await arrange('userHasAccessToProject', true);
    // Act
    const response = await makeRequest(server);
    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.isOpenDeployment).to.have.been.calledOnce;
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
    expect(authentication.isOpenDeployment).to.have.been.calledOnce;
    expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
    expect(handlerStub).to.not.have.been.called;

  });
  it('should redirect to login screen for unauthenticated deployment requests', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange('userHasAccessToProject', true);
    // Act
    const response = await server.inject({
      method: 'GET',
      url: validDeploymentUrl,
    });
    // Assert
    expect(response.statusCode).to.eq(302);
    expect(authentication.isOpenDeployment).to.have.been.calledOnce;
    expect(authentication.userHasAccessToProject).to.not.have.been.called;
    expect(handlerStub).to.not.have.been.called;
  });
  it('should allow open access to open deployments', async () => {
    // Arrange
    const { server, authentication, handlerStub } = await arrange('isOpenDeployment', true);
    // Act
    const response = await server.inject({
      method: 'GET',
      url: validDeploymentUrl,
    });
    // Assert
    expect(response.statusCode).to.exist;
    expect(authentication.isOpenDeployment).to.have.been.calledOnce;
    expect(handlerStub).to.have.been.calledOnce;
  });
});
