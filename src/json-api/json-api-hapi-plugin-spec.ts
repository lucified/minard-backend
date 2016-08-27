
import { expect } from 'chai';
import 'reflect-metadata';
import Hapi = require('hapi');

import { MINARD_ERROR_CODE } from '../shared/minard-error';
import { JsonApiHapiPlugin, parseActivityFilter } from './json-api-hapi-plugin';

const hapiAsyncHandler = require('hapi-async-handler');

const provisionServer = async (plugin: JsonApiHapiPlugin) => {
  const server = new Hapi.Server();
  server.connection({ port: 8080 });
  await server.register([hapiAsyncHandler]);
  await server.register([plugin]);
  return server;
};

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
      const plugin = new JsonApiHapiPlugin(mockFactory as any);
      const server = await provisionServer(plugin);

      // Act
      const options: Hapi.IServerInjectOptions = {
        method: 'GET',
        url: 'http://foo.com/activity?filter=project[2]',
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
      const mockFactory = () => ({
        getTeamActivity: async (projectId: number) => {
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
      const plugin = new JsonApiHapiPlugin(mockFactory as any);
      const server = await provisionServer(plugin);

      // Act
      const options: Hapi.IServerInjectOptions = {
        method: 'GET',
        url: 'http://foo.com/activity',
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
      const plugin = new JsonApiHapiPlugin(mockFactory as any);
      const server = await provisionServer(plugin);
      const options: Hapi.IServerInjectOptions = {
        method: 'POST',
        url: 'http://foo.com/projects',
        payload: {
          teamId,
          name,
          description,
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

});
