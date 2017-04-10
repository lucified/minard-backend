import { expect, use } from 'chai';
import 'reflect-metadata';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { getAccessToken } from '../config/config-test';
import { JsonApiHapiPlugin } from '../json-api';
import { ProjectModule } from '../project';
import { getTestServer } from '../server/hapi';
import { makeRequestWithAuthentication, MethodStubber, stubber } from '../shared/test';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import { generateTeamToken } from './team-token';

const validAccessToken = getAccessToken('idp|12345678', generateTeamToken(), 'foo@bar.com');
const makeRequest = makeRequestWithAuthentication(validAccessToken);

async function getServer(
  authenticationStubber: MethodStubber<AuthenticationHapiPlugin>,
  apiStubber: MethodStubber<JsonApiHapiPlugin>,
) {
  const kernel = bootstrap('test');
  kernel.rebind(AuthenticationHapiPlugin.injectSymbol).to(AuthenticationHapiPlugin);
  kernel.rebind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin);
  kernel.rebind(ProjectModule.injectSymbol).to(ProjectModule);
  const authenticationPlugin = stubber(authenticationStubber, AuthenticationHapiPlugin.injectSymbol, kernel);
  const apiPlugin = stubber(apiStubber, JsonApiHapiPlugin.injectSymbol, kernel);
  return {
    server: await getTestServer(true, authenticationPlugin.instance, apiPlugin.instance),
    authentication: authenticationPlugin.instance,
    api: apiPlugin.instance,
  };
}

type AuthorizationMethod = 'userHasAccessToProject' | 'userHasAccessToTeam' | 'userHasAccessToDeployment';

function arrange(
  authorizationMethod: AuthorizationMethod,
  hasAccess: boolean,
  handler: string,
  isAdmin: boolean = false,
) {
  return getServer(
    (p: AuthenticationHapiPlugin) => [
      sinon.stub(p, authorizationMethod)
        .returns(Promise.resolve(hasAccess)),
      sinon.stub(p, 'isAdmin')
        .returns(Promise.resolve(isAdmin)),
    ],
    (p: JsonApiHapiPlugin) => sinon.stub(p, handler)
      .yields(200)
      .returns(Promise.resolve(true)),
  );
}

describe('authorization for api routes', () => {
  describe('standard - in AuthenticationHapiPlugin', () => {
    describe('getProjectsHandler', () => {
      it('should allow listing authorized team\'s projects', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          true,
          'getProjectsHandler',
        );
        // Act
        await makeRequest(server, '/teams/1/relationships/projects');
        // Assert
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.getProjectsHandler).to.have.been.calledOnce;
      });
      it('should not allow listing unauthorized team\'s projects', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          false,
          'getProjectsHandler',
        );
        // Act
        const response = await makeRequest(server, '/teams/1/relationships/projects');
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.getProjectsHandler).to.not.have.been.called;
      });
    });
    describe('getProjectHandler', () => {
      it('should allow fetching an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          true,
          'getProjectHandler',
        );
        // Act
        await makeRequest(server, '/projects/1');
        // Assert
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getProjectHandler).to.have.been.calledOnce;
      });
      it('should not allow fetching an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          false,
          'getProjectHandler',
        );
        // Act
        await makeRequest(server, '/projects/1');
        // Assert
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getProjectHandler).to.not.have.been.called;
      });
    });
    describe('getBranchHandler', () => {
      it('should allow fetching a branch in an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          true,
          'getBranchHandler',
        );
        // Act
        await makeRequest(server, '/branches/1-master');
        // Assert
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getBranchHandler).to.have.been.calledOnce;
      });
      it('should not allow fetching a branch in an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange('userHasAccessToProject', false, 'getBranchHandler');
        // Act
        const response = await makeRequest(server, '/branches/1-master');
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getBranchHandler).to.not.have.been.called;
      });
    });

  });
  describe('preHandlers', () => {
    describe('postProjectHandler', () => {
      const payload = {
        data: {
          type: 'projects',
          attributes: {
            name: 'foo',
          },
          relationships: {
            team: {
              data: { id: 1, type: 'teams' },
            },
          },
        },
      };
      it('should allow creating a project under an authorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          true,
          'postProjectHandler',
        );
        // Act
        await makeRequest(server, '/projects', 'POST', payload);
        // Assert
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.postProjectHandler).to.have.been.calledOnce;
      });
      it('should not allow creating a project under an unauthorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          false,
          'postProjectHandler',
        );
        // Act
        const response = await makeRequest(server, '/projects', 'POST', payload);
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.postProjectHandler).to.not.have.been.called;
      });
    });
    describe('postCommentHandler', () => {
      const payload = {
        data: {
          type: 'comments',
          attributes: {
            email: 'foo@bar.com',
            message: 'bar',
            deployment: '1-1',
          },
        },
      };
      it('should allow creating a comment for a deployment in an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToDeployment',
          true,
          'postCommentHandler',
        );
        // Act
        await makeRequest(server, '/comments', 'POST', payload);

        // Assert
        expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
        expect(api.postCommentHandler).to.have.been.calledOnce;
      });
      it('should not allow creating a comment for a deployment in an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange('userHasAccessToDeployment', false, 'postCommentHandler');
        // Act
        const response = await makeRequest(server, '/comments', 'POST', payload);
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
        expect(api.postCommentHandler).to.not.have.been.called;
      });
    });
    describe('deleteCommentHandler', () => {
      function arrangeCommentRemoval(hasAccess: boolean) {
        return getServer(
          p => [
            sinon.stub(p, 'userHasAccessToDeployment')
              .returns(Promise.resolve(hasAccess)),
            sinon.stub(p, 'isAdmin')
              .returns(Promise.resolve(false)),
          ],
          p => [
            sinon.stub(p, 'deleteCommentHandler')
              .yields(200)
              .returns(Promise.resolve(true)),
            sinon.stub(p, 'getComment')
              .returns(Promise.resolve({deployment: '1-1'})),
          ],
        );
      }
      it('should allow deleting a comment for a deployment in an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeCommentRemoval(true);
        // Act
        const response = await makeRequest(server, '/comments/1', 'DELETE');
        // Assert
        expect(response).to.exist;
        expect(api.getComment).to.have.been.calledOnce;
        expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
        expect(api.deleteCommentHandler).to.have.been.calledOnce;
      });
      it('should not allow deleting a comment for a deployment in an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeCommentRemoval(false);
        // Act
        const response = await makeRequest(server, '/comments/1', 'DELETE');
        // Assert
        expect(api.getComment).to.have.been.calledOnce;
        expect(authentication.userHasAccessToDeployment).to.have.been.calledOnce;
        expect(api.deleteCommentHandler).to.not.have.been.called;
        expect(response.statusCode).to.eq(401);
      });
    });

    describe('postNotificationConfigurationHandler', () => {
      const payload = (teamId?: number, projectId?: number) => ({
        data: {
          type: 'notifications',
          attributes: {
            type: 'flowdock',
            teamId,
            projectId,
            flowToken: 'foo',
          },
        },
      });

      it('should allow creating a notification configuration for an authorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          true,
          'postNotificationConfigurationHandler',
        );
        // Act
        const response = await makeRequest(server, '/notifications', 'POST', payload(1));

        // Assert
        expect(response).to.exist;
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.postNotificationConfigurationHandler).to.have.been.calledOnce;
      });
      it('should not allow creating a notification configuration for an unauthorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          false,
          'postNotificationConfigurationHandler',
        );
        // Act
        const response = await makeRequest(server, '/notifications', 'POST', payload(1));

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.postNotificationConfigurationHandler).to.not.have.been.called;

      });
      it('should allow creating a notification configuration for an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          true,
          'postNotificationConfigurationHandler',
        );
        // Act
        const response = await makeRequest(server, '/notifications', 'POST', payload(undefined, 1));

        // Assert
        expect(response).to.exist;
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.postNotificationConfigurationHandler).to.have.been.calledOnce;
      });
      it('should not allow creating a notification configuration for an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          false,
          'postNotificationConfigurationHandler',
        );
        // Act
        const response = await makeRequest(server, '/notifications', 'POST', payload(undefined, 1));

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.postNotificationConfigurationHandler).to.not.have.been.called;

      });
    });
    describe('deleteNotificationConfigurationHandler', () => {
      function arrangeNotificationRemoval(hasAccess: boolean, teamId?: number, projectId?: number) {
        return getServer(
          p => [
            sinon.stub(p, projectId ? 'userHasAccessToProject' : 'userHasAccessToTeam')
              .returns(Promise.resolve(hasAccess)),
            sinon.stub(p, 'isAdmin')
              .returns(Promise.resolve(false)),
          ],
          p => [
            sinon.stub(p, 'deleteNotificationConfigurationHandler')
              .yields(200)
              .returns(Promise.resolve(true)),
            sinon.stub(p, 'getNotificationConfiguration')
              .returns(Promise.resolve({teamId, projectId})),
          ],
        );
      }
      it('should allow deleting a notification configuration for an authorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeNotificationRemoval(true, 1);
        // Act
        const response = await makeRequest(server, '/notifications/1', 'DELETE');
        // Assert
        expect(response).to.exist;
        expect(api.getNotificationConfiguration).to.have.been.calledOnce;
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.deleteNotificationConfigurationHandler).to.have.been.calledOnce;
      });
      it('should not allow deleting a notification configuration for an unauthorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeNotificationRemoval(false, 1);
        // Act
        const response = await makeRequest(server, '/notifications/1', 'DELETE');
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(api.getNotificationConfiguration).to.have.been.calledOnce;
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.deleteNotificationConfigurationHandler).to.not.have.been.called;
      });
      it('should allow deleting a notification configuration for an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeNotificationRemoval(true, undefined, 1);
        // Act
        const response = await makeRequest(server, '/notifications/1', 'DELETE');
        // Assert
        expect(response).to.exist;
        expect(api.getNotificationConfiguration).to.have.been.calledOnce;
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.deleteNotificationConfigurationHandler).to.have.been.calledOnce;
      });
      it('should not allow deleting a notification configuration for an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrangeNotificationRemoval(false, undefined, 1);
        // Act
        const response = await makeRequest(server, '/notifications/1', 'DELETE');
        // Assert
        expect(response.statusCode).to.eq(401);
        expect(api.getNotificationConfiguration).to.have.been.calledOnce;
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.deleteNotificationConfigurationHandler).to.not.have.been.called;
      });
    });
    describe('getActivityHandler', () => {
      it('should allow fetching activity for an authorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          true,
          'getActivityHandler',
        );
        // Act
        const response = await makeRequest(server, '/activity?filter=team[1]');

        // Assert
        expect(response).to.exist;
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.getActivityHandler).to.have.been.calledOnce;
      });
      it('should not allow fetching activity for an unauthorized team', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToTeam',
          false,
          'getActivityHandler',
        );
        // Act
        const response = await makeRequest(server, '/activity?filter=team[1]');

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToTeam).to.have.been.calledOnce;
        expect(api.getActivityHandler).to.not.have.been.called;
      });
      it('should allow fetching activity for an authorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          true,
          'getActivityHandler',
        );
        // Act
        const response = await makeRequest(server, '/activity?filter=project[1]');

        // Assert
        expect(response).to.exist;
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getActivityHandler).to.have.been.calledOnce;
      });
      it('should not allow fetching activity for an unauthorized project', async () => {
        // Arrange
        const { server, authentication, api } = await arrange(
          'userHasAccessToProject',
          false,
          'getActivityHandler',
        );
        // Act
        const response = await makeRequest(server, '/activity?filter=project[1]');

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(authentication.userHasAccessToProject).to.have.been.calledOnce;
        expect(api.getActivityHandler).to.not.have.been.called;
      });
    });
  });
});
