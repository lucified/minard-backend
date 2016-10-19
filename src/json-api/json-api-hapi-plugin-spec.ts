
import { expect } from 'chai';
import * as moment from 'moment';
import * as queryString from 'querystring';
import 'reflect-metadata';

import * as Hapi from '../server/hapi';
import { MINARD_ERROR_CODE } from '../shared/minard-error';
import { JsonApiHapiPlugin, parseActivityFilter } from './json-api-hapi-plugin';

const provisionServer = async (plugin: JsonApiHapiPlugin) => {
  const server = Hapi.getServer();
  server.connection({ port: 8080 });
  const options = {
    register: plugin.register,
    routes: {
        prefix: '/api',
    },
  };
  await server.register([options]);
  return server;
};

const baseUrl = 'http://localhost:8000';

describe('json-api-hapi-plugin', () => {

  describe('activity route', () => {
    it('should correctly get project activity', async() => {
      // Arrange
      const mockFactory = () => ({
        getProjectActivity: async (projectId: number) => {
          return [
            {
              id: 'foo',
            },
            {
              id: 'bar',
            },
          ];
        },
      });
      const plugin = new JsonApiHapiPlugin(mockFactory as any, baseUrl);
      const server = await provisionServer(plugin);

      // Act
      const options: Hapi.IServerInjectOptions = {
        method: 'GET',
        url: 'http://foo.com/api/activity?filter=project[2]',
      };
      const ret = await server.inject(options);

      // Assert
      expect(ret).to.exist;
      const parsed = JSON.parse(ret.payload);
      expect(ret.statusCode).to.equal(200);
      expect(parsed.data).to.have.length(2);
      expect(parsed.data[0].type).to.equal('activities');
    });

    it('should correctly get team activity', async() => {
      // Arrange
      const teamId = 6;
      const mockFactory = () => ({
        getTeamActivity: async (_teamId: number) => {
          expect(_teamId).to.equal(teamId);
          return [
            {
              id: 'foo',
            },
            {
              id: 'bar',
            },
          ];
        },
      });
      const plugin = new JsonApiHapiPlugin(mockFactory as any, baseUrl);
      const server = await provisionServer(plugin);

      // Act
      const options: Hapi.IServerInjectOptions = {
        method: 'GET',
        url: 'http://foo.com/api/activity?filter=team[6]',
      };
      const ret = await server.inject(options);

      // Assert
      expect(ret).to.exist;
      const parsed = JSON.parse(ret.payload);
      expect(ret.statusCode).to.equal(200);
      expect(parsed.data).to.have.length(2);
      expect(parsed.data[0].type).to.equal('activities');
    });
  });

  describe('parseActivityFilter', () => {
    it('should correctly parse filter with projectId', () => {
      const filterOptions = parseActivityFilter('project[943275]');
      expect(filterOptions.projectId).to.equal(943275);
    });

    it('should correctly parse filter with no projectId', () => {
      const filterOptions = parseActivityFilter('dfs9a87fa9');
      expect(filterOptions.projectId).to.equal(null);
    });

    it('should correctly parse empty filter', () => {
      const filterOptions = parseActivityFilter('');
      expect(filterOptions.projectId).to.equal(null);
    });

    it('should correctly parse null filter', () => {
      const filterOptions = parseActivityFilter('');
      expect(filterOptions.projectId).to.equal(null);
    });

    it('should correctly parse filter with teamId', () => {
      const filterOptions = parseActivityFilter('team[54]');
      expect(filterOptions.teamId).to.equal(54);
    });
  });

  describe('POST "/projects"', () => {
    const projectId = 4;
    async function injectRequest(teamId: any, name: string, description: string | undefined) {
      const mockFactory = () => ({
        createProject: async (_teamId: number, _name: string, _description: string) => {
          return {
            id: projectId,
            teamId: _teamId,
            name: _name,
            description: _description,
          };
        },
      });
      const plugin = new JsonApiHapiPlugin(mockFactory as any, baseUrl);
      const server = await provisionServer(plugin);
      const options: Hapi.IServerInjectOptions = {
        method: 'POST',
        url: 'http://foo.com/api/projects',
        headers: {
          'Origin': 'foo.com',
          'Access-Control-Request-Method': 'POST',
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
      };
      return await server.inject(options);
    }

    it('should create project with valid arguments', async() => {
      // Arrange & Act
      const teamId = 5;
      const name = 'foo-bar';
      const description = 'foo project';
      const ret = await injectRequest(teamId, name, description);
      // Assert
      expect(ret).to.exist;
      const parsed = JSON.parse(ret.payload);
      expect(ret.statusCode).to.equal(201);
      expect(parsed.data.type).to.equal('projects');
      expect(parsed.data.id).to.equal(String(projectId));
      expect(parsed.data.attributes.name).to.equal(name);
      expect(parsed.data.attributes.description).to.equal(description);
      expect(ret.headers['access-control-allow-origin']).to.equal('foo.com');
    });

    it('should create project when no description is provided', async() => {
      const ret = await injectRequest(5, 'foo-bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(201);
    });

    it('should respond with BAD_REQUEST when project name has whitespace', async() => {
      const ret = await injectRequest(5, 'foo bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when project name has a special character', async() => {
      const ret = await injectRequest(5, 'foo%bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when project name is undefined', async() => {
      const ret = await injectRequest(5, 'foo%bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when team id is undefined', async() => {
      const ret = await injectRequest(undefined, 'foo%bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when team id is not a number', async() => {
      const ret = await injectRequest('foo5', 'foo-bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });
  });

  describe('PATCH "/projects/:id"', () => {
    async function injectRequest(
      projectId: number,
      name: string | undefined,
      description: string | undefined) {
      const mockFactory = () => ({
        editProject: async (_projectId: number, attributes: { name: string, description: string}) => {
          return {
            id: _projectId,
            name: attributes.name,
            description: attributes.description,
          };
        },
      });
      const plugin = new JsonApiHapiPlugin(mockFactory as any, baseUrl);
      const server = await provisionServer(plugin);
      const options: Hapi.IServerInjectOptions = {
        method: 'PATCH',
        url: `http://foo.com/api/projects/${projectId}`,
        payload: {
          data: {
            id: projectId,
            type: 'projects',
            attributes: {
              name,
              description,
            },
          },
        },
      };
      return await server.inject(options);
    }

    async function shouldSucceed(
      name: string | undefined, description: string | undefined) {
      // Arrange & Act
      const projectId = 4;
      const ret = await injectRequest(projectId, name, description);
      // Assert
      expect(ret).to.exist;
      const parsed = JSON.parse(ret.payload);
      expect(ret.statusCode).to.equal(200);
      expect(parsed.data.type).to.equal('projects');
      expect(parsed.data.id).to.equal(String(projectId));
      return parsed;
    }

    it('should edit project when both name and description provided', async() => {
      const name = 'foo-bar';
      const description = 'foo description';
      const ret = await shouldSucceed(name, description);
      expect(ret.data.attributes.name).to.equal(name);
      expect(ret.data.attributes.description).to.equal(description);
    });

    it('should edit project when only name provided', async() => {
      await shouldSucceed('foo-bar', undefined);
    });

    it('should edit project when only description provided', async() => {
      await shouldSucceed(undefined, 'foo description');
    });

    it('should respond with BAD_REQUEST when project name has whitespace', async() => {
      const ret = await injectRequest(5, 'foo bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when project name has a special character', async() => {
      const ret = await injectRequest(5, 'foo%bar', undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

    it('should respond with BAD_REQUEST when neither project name or description is provided', async() => {
      const ret = await injectRequest(5, undefined, undefined);
      expect(ret).to.exist;
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });
  });

  describe('GET "/branches/:id/relationships/commits"', () => {
    async function injectRequest(
      projectId: number,
      branchName: string,
      params: { until?: string, count?: number }) {
      const mockFactory = () => ({
        getBranchCommits: async (_projectId: number, _branchName: string, _until: moment.Moment, _count: number) => {
          try {
            expect(_projectId).to.equal(projectId);
            expect(_branchName).to.equal(branchName);
            if (!params.until) {
              expect(_until).to.equal(params.until);
            } else {
              expect(_until.isSame(moment(params.until)));
            }
            expect(_count).to.equal(params.count);
          } catch (err) {
            // log here as these expect clauses cause hapi to return
            // a server error, which can be misleading
            console.log(err);
            throw err;
          }
          return [{}, {}];
        },
      });
      const plugin = new JsonApiHapiPlugin(mockFactory as any, baseUrl);
      const server = await provisionServer(plugin);
      const options: Hapi.IServerInjectOptions = {
        method: 'GET',
        url: `http://foo.com/api/branches/${projectId}-${branchName}/relationships/commits` +
          `?${queryString.stringify(params)}`,
      };
      return await server.inject(options);
    }

    it('should return 200 when request is valid and includes all params', async () => {
      const projectId = 10;
      const count = 5;
      const until = '2012-09-20T08:50:22.000Z';
      const ret = await injectRequest(projectId, 'foo', { until, count });
      expect(ret.statusCode).to.equal(200);
      expect(JSON.parse(ret.payload).data).to.have.length(2);
    });

    it('should return 200 when request is valid, includes all params, and branchName has a hyphen', async () => {
      const projectId = 10;
      const count = 5;
      const until = '2012-09-20T08:50:22.000Z';
      const ret = await injectRequest(projectId, 'foo--foo', { until, count });
      expect(ret.statusCode).to.equal(200);
      expect(JSON.parse(ret.payload).data).to.have.length(2);
    });

    it('should return 200 when request is valid and does not include count', async () => {
      const projectId = 10;
      const until = '2012-09-20T08:50:22.000Z';
      const ret = await injectRequest(projectId, 'foo', { until });
      expect(ret.statusCode).to.equal(200);
      expect(JSON.parse(ret.payload).data).to.have.length(2);
    });

    it('should return BAD_REQUEST when request has invalid until', async () => {
      const projectId = 10;
      const count = 5;
      const until = '2012-0-20:50:22.000Z';
      const ret = await injectRequest(projectId, 'foo', { until, count });
      expect(ret.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
    });

  });

});
