
import 'reflect-metadata';

import Logger from '../shared/logger';
import { expect } from 'chai';

import { OperationsModule } from './';

const logger = Logger(undefined, true);

describe('operations-module', () => {

  describe('assureScreenshotsGenerated', () => {
    it('should create missing screenshot for extracted deployment', () => {

    });
    it('should not create screenshot for non-extracted, but succesful deployment', () => {

    });
    it('should gracefully handle error fetching deployment information', () => {

    });
    it('should gracefully handle error taking screenshots', () => {

    });
  });

});
