
// polyfills
import 'reflect-metadata';

import { Server } from 'hapi';

import { get } from './config';
import Migrations from './migrations';
import { MinardServer } from './server';
import { Logger } from './shared/logger';
import { Route53Updater } from './shared/route53-updater';
import { sleep } from './shared/sleep';

const migrations = get<Migrations>(Migrations.injectSymbol);
const route53updater = get<Route53Updater>(Route53Updater.injectSymbol);
const minardServer = get<MinardServer>(MinardServer.injectSymbol);
const localBaseUrl = process.env.ROUTE53_BASEURL_LOCAL;
const route53Zone = process.env.ROUTE53_ZONE_LOCAL;

async function start() {
  try {
    await migrations.prepareDatabase();
    const server = await minardServer.start();
    minardServer.logger.info('Charles listening on %s', server.info.uri);
    trapSignals(server, minardServer.logger);
    await route53updater.update(localBaseUrl, route53Zone);
  } catch (err) {
    minardServer.logger.error('Error starting charles', err);
  }
}

start();

function trapSignals(server: Server, logger: Logger, exitDelay = 15000) {

  server.ext('onPreStop', async (_server, next) => {
    logger.debug('Starting exit delay');
    await sleep(exitDelay);
    logger.debug('Exit delay finished');
    return next();
  });

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
