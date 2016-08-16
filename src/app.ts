
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { MinardServer } from './server';

import { get } from './config';

const server = get<MinardServer>(MinardServer.injectSymbol);

server.start().catch((err) => {
  server.logger.error('Error starting charles');
});
