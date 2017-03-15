import { expect, use } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { get, kernel } from '../config';
import { getAccessToken } from '../config/config-test';
import DeploymentHapiPlugin from '../deployment/deployment-hapi-plugin';
import { JsonApiHapiPlugin, JsonApiModule } from '../json-api';
import { getTestServer } from '../server/hapi';
import { fetchMock } from '../shared/fetch';
import AuthenticationHapiPlugin, { sanitizeUsername } from './authentication-hapi-plugin';
import { generateTeamToken, TeamToken, teamTokenLength } from './team-token';

const defaultTeamTokenString = generateTeamToken();
expect(defaultTeamTokenString.length).to.equal(teamTokenLength);
const defaultEmail = 'foo@bar.com';
const defaultSub = 'idp|12345678';
const defaultUserName = sanitizeUsername(defaultSub);

const validAccessToken = getAccessToken(defaultSub, defaultTeamTokenString, defaultEmail);

const validTeamToken: TeamToken = {
  token: defaultTeamTokenString,
  teamId: 1,
  createdAt: moment.utc(),
};

describe('authorization', () => {

  let stubs: sinon.SinonStub[];

  beforeEach(async () => {
    fetchMock.restore();
    // Catch the admin check
    const path = new RegExp(`/groups\\?sudo=${defaultUserName}`);
    fetchMock.mock(path, 401);
    stubs = [];
  });
  afterEach(() => {
    stubs.forEach(stub => stub.restore());
  });

  describe('json api', () => {

    function getServer() {
      return getTestServer(true,
        get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol),
        get<JsonApiHapiPlugin>(JsonApiHapiPlugin.injectSymbol),
      );
    }
    const stubJsonApi = (stubber: (api: JsonApiModule) => sinon.SinonStub | sinon.SinonStub[]) => {
      const jsonApiModule = get<JsonApiModule>(JsonApiModule.injectSymbol);
      stubs = stubs.concat(stubber(jsonApiModule));
      kernel.rebind(JsonApiModule.injectSymbol).toConstantValue(jsonApiModule);
      return jsonApiModule;
    };

    describe('GET requests', () => {
      it('should not allow a listing of foreign team\'s projects', async () => {
        // Arrange
        const foreignTeamId = 22;
        const path = new RegExp(`/groups/${foreignTeamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, 401);
        const server = await getServer();
        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/teams/${foreignTeamId}/relationships/projects`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });
        expect(validTeamToken.teamId).to.not.eq(foreignTeamId);
        expect(response.statusCode).to.eq(401);
      });
      it('should allow listing own team\'s projects', async () => {
        // Arrange
        const ownTeamId = validTeamToken.teamId;
        const path = new RegExp(`/groups/${ownTeamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: ownTeamId,
        });
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'getProjects')
          .returns(Promise.resolve([{ id: 1 }])));
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/teams/${ownTeamId}/relationships/projects`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(200);
        expect(jsonApi.getProjects).to.have.been.calledOnce;
      });
      it('should not allow access to an unauthorized project', async () => {
        // Arrange
        const projectId = 22;
        const path = new RegExp(`\/projects\/${projectId}`);
        fetchMock.mock(path, 401);
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/projects/${projectId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
      });
      it('should allow access to an authorized project', async () => {
        // Arrange
        const projectId = 22;
        const path = new RegExp(`\/projects\/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: projectId,
        });
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'getProject')
          .returns(Promise.resolve({ id: projectId })));
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/projects/${projectId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(200);
        expect(jsonApi.getProject).to.have.been.calledOnce;
      });
      it('should not allow access to an unauthorized project\'s branch', async () => {
        // Arrange
        const projectId = 22;
        const branchId = `${projectId}-master`;
        const path = new RegExp(`\/projects\/${projectId}`);
        fetchMock.mock(path, 401);
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/branches/${branchId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
      });
      it('should allow access to an authorized project\'s branch', async () => {
        // Arrange
        const projectId = 22;
        const branchId = `${projectId}-master`;
        const path = new RegExp(`\/projects\/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: projectId,
        });
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'getBranch')
          .returns(Promise.resolve({ id: branchId })));
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/branches/${branchId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(200);
        expect(jsonApi.getBranch).to.have.been.calledOnce;

      });
      it('should not allow access to an unauthorized project\'s branch', async () => {
        // Arrange
        const projectId = 22;
        const branchId = `${projectId}-master`;
        const path = new RegExp(`\/projects\/${projectId}`);
        fetchMock.mock(path, 401);
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/branches/${branchId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
      });
      it('should allow fetching a commit for an authorized project', async () => {
        // Arrange
        const projectId = 22;
        const commitId = `${projectId}-12345678`;
        const path = new RegExp(`\/projects\/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: projectId,
        });
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'getCommit')
          .returns(Promise.resolve({ id: commitId })));
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/commits/${commitId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });
        // Assert
        expect(response.statusCode).to.eq(200);
        expect(jsonApi.getCommit).to.have.been.calledOnce;
      });
      it('should not allow fetching a commit for an unauthorized project', async () => {
        // Arrange
        const projectId = 22;
        const commitId = `${projectId}-as2342`;
        const path = new RegExp(`\/projects\/${projectId}`);
        fetchMock.mock(path, 401);
        const server = await getServer();

        // Act
        const response = await server.inject({
          method: 'GET',
          url: `http://foo.com/branches/${commitId}`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
      });
    });
    describe('POST requests', () => {
      it('should not allow a creating a project for a foreign team', async () => {
        // Arrange
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'createProject')
          .returns(Promise.resolve({ id: 1 })));
        const server = await getServer();

        const teamId = 22;
        const path = new RegExp(`/groups/${teamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, 401);
        const name = 'fooProject';
        const description = 'fooDescription';

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/projects`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'projects',
              attributes: {
                name,
                description,
              },
              relationships: {
                team: {
                  data: { id: teamId, type: 'teams' },
                },
              },
            },
          },
        });

        // Assert
        expect(validTeamToken.teamId).to.not.eq(teamId);
        expect(jsonApi.createProject).to.not.have.been.called;
        expect(response.statusCode).to.eq(401);

      });
      it('should allow creating a project for the creator\'s team', async () => {
        // Arrange
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'createProject')
          .returns(Promise.resolve({ id: 1 })));
        const server = await getServer();

        const teamId = validTeamToken.teamId;
        const path = new RegExp(`/groups/${teamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: teamId,
        });
        const name = 'fooProject';
        const description = 'fooDescription';
        const jsonApiProject = {
          data: {
            type: 'projects',
            attributes: {
              name,
              description,
            },
            relationships: {
              team: {
                data: { id: teamId, type: 'teams' },
              },
            },
          },
        };

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/projects`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: jsonApiProject,
        });

        // Assert
        expect(response.statusCode).to.eq(201);
        expect(jsonApi.createProject).to.have.been.calledOnce;
        expect(jsonApi.createProject).to.have.been.calledWith(teamId);
      });

      it('should not allow commenting on a deployment belonging to a foreign team\'s project', async () => {

        // Arrange
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'addComment')
          .returns(Promise.resolve({ id: 1 })));
        const server = await getServer();

        const projectId = 1;
        const deploymentId = 1;

        const path = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, 401);

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/comments`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'comments',
              attributes: {
                email: 'foo@bar.com',
                message: 'bar',
                deployment: `${projectId}-${deploymentId}`,
              },
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(jsonApi.addComment).to.not.have.been.called;

      });
      it('should allow commenting on a deployment belonging to the commentor\'s team\'s project', async () => {
        // Arrange
        const jsonApi = stubJsonApi(api => sinon.stub(api, 'addComment')
          .returns(Promise.resolve({ id: 1 })));
        const server = await getServer();

        const teamId = validTeamToken.teamId;
        const projectId = 1;
        const deploymentId = 1;

        const path = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: teamId,
        });
        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/comments`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'comments',
              attributes: {
                email: 'foo@bar.com',
                message: 'bar',
                deployment: `${projectId}-${deploymentId}`,
              },
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(201);
        expect(jsonApi.addComment).to.have.been.calledOnce;
        expect(jsonApi.addComment).to.have.been.called.calledWith(deploymentId);
      });
      it('should not allow setting foreign team\'s notification configuration', async () => {

        // Arrange
        const jsonApi = stubJsonApi(api => [
          sinon.stub(api, 'createNotificationConfiguration')
            .returns(Promise.resolve(12)),
          sinon.stub(api, 'getNotificationConfiguration')
            .returns(Promise.resolve(12)),
        ]);
        const server = await getServer();

        const teamId = 1;
        const path = new RegExp(`/groups/${teamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, 401);
        const config = {
          type: 'flowdock',
          teamId,
          flowToken: 'foo',
        };

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/notifications`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'notifications',
              attributes: config,
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(jsonApi.createNotificationConfiguration).to.not.have.been.called;

      });
      it('should allow setting caller\'s team\'s notification configuration', async () => {
        // Arrange
        const teamId = 1;
        const config = {
          type: 'flowdock',
          teamId,
          flowToken: 'foo',
        };

        const jsonApi = stubJsonApi(api => [
          sinon.stub(api, 'createNotificationConfiguration')
            .returns(Promise.resolve(12)),
          sinon.stub(api, 'getNotificationConfiguration')
            .returns(Promise.resolve(config)),
        ]);
        const server = await getServer();

        const path = new RegExp(`/groups/${teamId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: teamId,
        });

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/notifications`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'notifications',
              attributes: config,
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(201);
        expect(jsonApi.createNotificationConfiguration).to.have.been.calledOnce;
        expect(jsonApi.createNotificationConfiguration).to.have.been.calledWith(config);
      });
      it('should not allow setting foreign projects\'s notification configuration', async () => {

        // Arrange
        const jsonApi = stubJsonApi(api => [
          sinon.stub(api, 'createNotificationConfiguration')
            .returns(Promise.resolve(12)),
          sinon.stub(api, 'getNotificationConfiguration')
            .returns(Promise.resolve(12)),
        ]);
        const server = await getServer();

        const projectId = 11;
        const path = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, 401);
        const config = {
          type: 'flowdock',
          projectId,
          flowToken: 'foo',
        };

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/notifications`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'notifications',
              attributes: config,
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(401);
        expect(jsonApi.createNotificationConfiguration).to.not.have.been.called;

      });
      it('should allow setting caller\'s team\'s project\'s notification configuration', async () => {
        // Arrange
        const projectId = 11;
        const config = {
          type: 'flowdock',
          projectId,
          flowToken: 'foo',
        };
        const jsonApi = stubJsonApi(api => [
          sinon.stub(api, 'createNotificationConfiguration')
            .returns(Promise.resolve(12)),
          sinon.stub(api, 'getNotificationConfiguration')
            .returns(Promise.resolve(config)),
        ]);
        const server = await getServer();

        const path = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
        fetchMock.mock(path, {
          id: projectId,
        });

        // Act
        const response = await server.inject({
          method: 'POST',
          url: `http://foo.com/notifications`,
          headers: {
            'Authorization': `Bearer ${validAccessToken}`,
          },
          payload: {
            data: {
              type: 'notifications',
              attributes: config,
            },
          },
        });

        // Assert
        expect(response.statusCode).to.eq(201);
        expect(jsonApi.createNotificationConfiguration).to.have.been.calledOnce;
        expect(jsonApi.createNotificationConfiguration).to.have.been.calledWith(config);
      });
    });
  });

  describe('raw deployments', () => {
    type Stubber = (plugin: DeploymentHapiPlugin) => sinon.SinonStub | sinon.SinonStub[];
    const stubDeploymentHapiPlugin = (stubber: Stubber) => {
      const _plugin = get<DeploymentHapiPlugin>(DeploymentHapiPlugin.injectSymbol);
      stubs = stubs.concat(stubber(_plugin));
      kernel.rebind(DeploymentHapiPlugin.injectSymbol).toConstantValue(_plugin);
      return _plugin;
    };
    async function getServer() {
      const server = await getTestServer(false,
        get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol),
      );
      server.handler('directory', (_route, options) => {
        return (request, reply) => {
          if (options && typeof (options as any).path === 'function') {
            reply((options as any).path(request));
          }
        };
      });
      await server.register(get<DeploymentHapiPlugin>(DeploymentHapiPlugin.injectSymbol));
      await server.initialize();
      return server;
    }

    it('should not allow accessing foreign team\'s deployments', async () => {

      // Arrange
      const projectId = 11;
      const deploymentId = 12;
      const gitlabPath = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
      fetchMock.mock(gitlabPath, 401);
      const stubbedPlugin = stubDeploymentHapiPlugin(plugin => [
        sinon.stub(plugin, 'serveDirectory')
          .returns('foob'),
      ]);
      const server = await getServer();

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://deployment-abcdef-${projectId}-${deploymentId}.foo.com`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).to.eq(401);
      expect(stubbedPlugin.serveDirectory).to.not.have.been.called;

    });
    it('should allow accessing own team\'s deployments', async () => {
      // Arrange
      const projectId = 11;
      const deploymentId = 12;
      const gitlabPath = new RegExp(`/projects/${projectId}\\?sudo=${defaultUserName}`);
      fetchMock.mock(gitlabPath, {
        id: projectId,
      });
      const stubbedPlugin = stubDeploymentHapiPlugin(plugin => [
        sinon.stub(plugin, 'serveDirectory').returns('foob'),
        sinon.stub(plugin, 'checkHash').returns(Promise.resolve(true)),
      ]);
      const server = await getServer();

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `http://deployment-abcdef-${projectId}-${deploymentId}.foo.com`,
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).to.eq(404);
      expect(stubbedPlugin.serveDirectory).to.not.have.been.called;
      expect(stubbedPlugin.checkHash).to.have.been.calledOnce;
    });
  });
});
