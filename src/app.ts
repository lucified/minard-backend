
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { OperationsModule } from './operations';
import { MinardServer } from './server';

import { get } from './config';

const server = get<MinardServer>(MinardServer.injectSymbol);
server.start().catch((err) => {
  server.logger.error('Error starting charles');
});

const operations = get<OperationsModule>(OperationsModule.injectSymbol);
operations.runBasicMaintenceTasks().catch(err => {
  server.logger.error('Error running maintenance tasks', err);
});
