
import { expect } from 'chai';
import 'reflect-metadata';

import { parseApiBranchId } from './conversions';

describe('json-api/conversions', () => {

  describe('parseApiBranchId', () => {

    it('should work for 4-foo', () => {
      expect(parseApiBranchId('4-foo')).to.deep.equal({ projectId: 4, branchName: 'foo' });
    });

    it('should work for 4-foo-bar', () => {
      expect(parseApiBranchId('4-foo-bar')).to.deep.equal({ projectId: 4, branchName: 'foo-bar' });
    });

    it('should work for foo-foo-bar', () => {
      expect(parseApiBranchId('foo-foo-bar')).to.deep.equal(null);
    });

  });

});
