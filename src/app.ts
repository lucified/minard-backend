
// polyfills
import 'reflect-metadata';

import { get } from './config';
import Migrations from './migrations';
import { MinardServer } from './server';
import { Logger } from './shared/logger';
import { Route53Updater } from './shared/route53-updater';

const migrations = get<Migrations>(Migrations.injectSymbol);
const route53updater = get<Route53Updater>(Route53Updater.injectSymbol);
const minardServer = get<MinardServer>(MinardServer.injectSymbol);
const localBaseUrl = process.env.ROUTE53_BASEURL_LOCAL;
const route53Zone = process.env.ROUTE53_ZONE_LOCAL;

async function start() {
  try {
    await migrations.prepareDatabase();
    await minardServer.start();
    trapSignals(minardServer, minardServer.logger);
    await route53updater.update(localBaseUrl, route53Zone);
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
