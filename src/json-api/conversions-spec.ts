
import { expect } from 'chai';
import 'reflect-metadata';

import { parseApiBranchId, parseApiDeploymentId } from './conversions';

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

  describe('parseApiDeploymentId', () => {
    it('should work for 4-2', () => {
      expect(parseApiDeploymentId('4-2')).to.deep.equal({ projectId: 4, deploymentId: 2 });
    });
    it('should work for 464-43', () => {
      expect(parseApiDeploymentId('464-43')).to.deep.equal({ projectId: 464, deploymentId: 43 });
    });
  });

});
