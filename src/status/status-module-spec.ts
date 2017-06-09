import { expect } from 'chai';
import 'reflect-metadata';

import { getEcsStatus } from './status-module';

describe('getEcsStatus', () => {
  it('should work correctly', async () => {
    if (process.env.TEST_ECS) {
      const response = await getEcsStatus('staging');
      expect(response).to.exist;
      console.dir(response, {depth: 5, colors: true});
    }
  });
});
