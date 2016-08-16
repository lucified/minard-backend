
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { getServer } from './config';

const server = getServer();

server.start().catch((err) => {
  server.logger.error('Error starting charles');
});
