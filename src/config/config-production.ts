
import { interfaces } from 'inversify';
import * as Knex from 'knex';
import * as winston from 'winston';

import { deploymentFolderInjectSymbol } from '../deployment';
import { externalBaseUrlInjectSymbol, goodOptionsInjectSymbol, hostInjectSymbol, portInjectSymbol} from '../server';
import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { loggerInjectSymbol } from '../shared/logger';
import { systemHookBaseUrlSymbol } from '../system-hook/system-hook-module';

import {
  screenshotFolderInjectSymbol,
  screenshotHostInjectSymbol,
  screenshotPortInjectSymbol,
} from '../screenshot';

import Logger from '../shared/logger';
import { FilterStream } from './utils';

// Logging configuration
// ---------------------

function requestFilter(data: any) {
  // filter out runner's requests for new build jobs
  if (data.path
      && data.path.indexOf('/ci/api/v1/builds/register.json') !== -1
      && data.statusCode === 404) {
    return false;
  }
  return true;
};

const goodOptions = {
  reporters: {
    console: [
      new FilterStream(requestFilter),
      {
        module: 'good-squeeze',
        name: 'Squeeze',
        args: [
          {
            error: '*',
            ops: '*', // log load
          },
        ],
      },
      {
        module: 'good-console',
      },
      'stdout',
    ],
  },
};

const winstonOptions = {
  transports: [
    new winston.transports.Console({
      level: 'info',
      colorize: true,
      timestamp: true,
      prettyPrint: true,
      silent: false,
    }),
  ],
};

// General networking
// ------------------

const HOST = process.env.HOST ? process.env.HOST : '0.0.0.0';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const GITLAB_HOST = process.env.GITLAB_HOST ? process.env.GITLAB_HOST : 'localhost';
const GITLAB_PORT = process.env.GITLAB_PORT ? parseInt(process.env.GITLAB_PORT, 10) : 10080;
const SYSTEMHOOK_BASEURL = process.env.SYSTEMHOOK_BASEURL ? process.env.SYSTEMHOOK_BASEURL : `http://charles:${PORT}`;
const SCREENSHOT_HOST = process.env.SCREENSHOT_HOST ? process.env.SCREENSHOT_HOST : 'minard.dev';
const SCREENSHOT_PORT = process.env.SCREENSHOT_PORT ? process.env.SCREENSHOT_PORT : 8000;
const EXTERNAL_BASEURL = `http://localhost:${PORT}`;

// Database configuration
// ----------------------

const DB_ADAPTER = process.env.DB_ADAPTER ? process.env.DB_ADAPTER : 'postgresql';
const DB_HOST = process.env.DB_HOST ? process.env.DB_HOST : 'localhost';
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
const DB_USER = process.env.DB_USER ? process.env.DB_USER : 'gitlab';
const DB_PASS = process.env.DB_PASS ? process.env.DB_PASS : 'password';
const DB_NAME = process.env.DB_NAME ? process.env.DB_NAME : 'gitlabhq_production';
const knex = Knex({
  client: DB_ADAPTER,
  connection: {
    host     : DB_HOST,
    user     : DB_USER,
    password : DB_PASS,
    database : DB_NAME,
    port: DB_PORT,
  },
  pool: {
    min: 2,
    max: 10,
    bailAfter: 10 * 60 * 1000,
  } as any,
});

// Filesystem configuration
// ------------------------

const DEPLOYMENT_FOLDER = process.env.DEPLOYMENT_FOLDER ? process.env.DEPLOYMENT_FOLDER : 'gitlab-data/monolith/';
const SCREENSHOT_FOLDER = process.env.SCREENSHOT_FOLDER ? process.env.SCREENSHOT_FOLDER : 'gitlab-data/screenshots';

// Inversify kernel bindings
// -------------------------

export default (kernel: interfaces.Kernel) => {
  kernel.bind(goodOptionsInjectSymbol).toConstantValue(goodOptions);
  kernel.bind(loggerInjectSymbol).toConstantValue(Logger(winstonOptions));
  kernel.bind(hostInjectSymbol).toConstantValue(HOST);
  kernel.bind(portInjectSymbol).toConstantValue(PORT);
  kernel.bind(gitlabHostInjectSymbol).toConstantValue(`http://${GITLAB_HOST}:${GITLAB_PORT}`);
  kernel.bind(systemHookBaseUrlSymbol).toConstantValue(SYSTEMHOOK_BASEURL);
  kernel.bind(deploymentFolderInjectSymbol).toConstantValue(DEPLOYMENT_FOLDER);
  kernel.bind('gitlab-knex').toConstantValue(knex);
  kernel.bind(screenshotHostInjectSymbol).toConstantValue(SCREENSHOT_HOST);
  kernel.bind(screenshotPortInjectSymbol).toConstantValue(SCREENSHOT_PORT);
  kernel.bind(screenshotFolderInjectSymbol).toConstantValue(SCREENSHOT_FOLDER);
  kernel.bind(externalBaseUrlInjectSymbol).toConstantValue(EXTERNAL_BASEURL);
};
