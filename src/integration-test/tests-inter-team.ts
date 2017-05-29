/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */
// import { expect } from 'chai';

// import { JsonApiEntity } from '../json-api/types';
// import { NotificationConfiguration, NotificationType } from '../notification/types';
import { CharlesClients } from './types';
// import {
//   log,
//   runCommand,
//   withPing,
// } from './utils';

export default (
  _clients: CharlesClients,
  _projectName = 'regular-project',
) => {
  describe.skip('inter-team tests', () => Promise.resolve(true));
};
