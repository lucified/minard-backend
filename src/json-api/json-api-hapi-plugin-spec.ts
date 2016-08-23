
import { expect } from 'chai';
import 'reflect-metadata';
import Hapi = require('hapi');

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

});
