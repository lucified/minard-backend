
// polyfills
import 'reflect-metadata';

import Migrations from './migrations';
import { MinardServer } from './server';

import { get } from './config';
import { registerService } from './shared/dns-register';

const migrations = get<Migrations>(Migrations.injectSymbol);
const server = get<MinardServer>(MinardServer.injectSymbol);

const serviceName = ['charles'];
if (process.env.LUCIFY_ENV) {
  serviceName.push(process.env.LUCIFY_ENV);
}

async function start() {
  try {
    await migrations.prepareDatabase();
    await Promise.all([server.start(), registerService(serviceName.join('-'))]);
  } catch (err) {
    server.logger.error('Error starting charles', err);
  }
}

start();
