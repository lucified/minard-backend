
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { MinardServer } from './server';

import { get } from './config';
import { registerService } from './shared/dns-register';

const server = get<MinardServer>(MinardServer.injectSymbol);

Promise.all([server.start(), registerService()]).catch((err) => {
  server.logger.error('Error starting charles', err);
});
