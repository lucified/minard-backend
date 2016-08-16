
import { expect } from 'chai';
import 'reflect-metadata';
import Hapi = require('hapi');

import { get } from '../config';
import { JsonApiHapiPlugin, parseActivityFilter } from './json-api-hapi-plugin';

const provisionServer = async () => {
  const plugin = get<JsonApiHapiPlugin>(JsonApiHapiPlugin.injectSymbol);
  const server = new Hapi.Server();
  server.connection({ port: 8080 });
  await server.register([plugin]);
  return server;
};

describe('json-api-hapi-plugin', () => {

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
