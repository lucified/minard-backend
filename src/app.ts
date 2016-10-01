
// polyfills
import 'reflect-metadata';

import Migrations from './migrations';
import { MinardServer } from './server';

import { get } from './config';
import { Route53Updater } from './shared/route53-updater';

const migrations = get<Migrations>(Migrations.injectSymbol);
const route53updater = get<Route53Updater>(Route53Updater.injectSymbol);
const server = get<MinardServer>(MinardServer.injectSymbol);
const localBaseUrl = process.env.ROUTE53_BASEURL_LOCAL;
const route53Zone = process.env.ROUTE53_ZONE_LOCAL;

async function start() {
  try {
    await migrations.prepareDatabase();
    await server.start();
    await route53updater.update(localBaseUrl, route53Zone);
  } catch (err) {
    server.logger.error('Error starting charles', err);
  }
}

start();
