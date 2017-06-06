
// polyfills
import 'reflect-metadata';

import { bootstrap } from './config';
import Migrations from './migrations';
import { MinardServer } from './server';
import { Logger } from './shared/logger';

const kernel = bootstrap(undefined, false);
const migrations = kernel.get<Migrations>(Migrations.injectSymbol);
const minardServer = kernel.get<MinardServer>(MinardServer.injectSymbol);

async function start() {
  try {
    await migrations.prepareDatabase();
    await minardServer.start();
    trapSignals(minardServer, minardServer.logger);
  } catch (err) {
    minardServer.logger.error('Error starting charles', err);
  }
}

start();

function trapSignals(server: MinardServer, logger: Logger) {

  function stop(signal: string) {
    return async () => {
      logger.info('RECEIVED %s', signal);
      await server.stop();
      logger.info('Charles is exiting with code 0');
      process.exit(0);
    };
  }

  ['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, stop(signal)));

}
