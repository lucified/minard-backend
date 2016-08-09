
import { expect } from 'chai';
import 'reflect-metadata';

import { parseActivityFilter } from './json-api-hapi-plugin';

describe('json-api-hapi-plugin', () => {

  describe('parseActivityFilter', () => {
    it('should correctly parse filter with projectId', () => {
      const filterOptions = parseActivityFilter('project943275');
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
