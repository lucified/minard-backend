
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
  screenshotterBaseurlInjectSymbol,
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

const env = process.env;
// General networking
// ------------------

const HOST = env.HOST ? env.HOST : '0.0.0.0';
const PORT = env.PORT ? parseInt(env.PORT, 10) : 8000;
const GITLAB_HOST = env.GITLAB_HOST ? env.GITLAB_HOST : 'localhost';
const GITLAB_PORT = env.GITLAB_PORT ? parseInt(env.GITLAB_PORT, 10) : 10080;
const SYSTEMHOOK_BASEURL = env.SYSTEMHOOK_BASEURL ? env.SYSTEMHOOK_BASEURL : `http://charles:${PORT}`;
const SCREENSHOT_HOST = env.SCREENSHOT_HOST ? env.SCREENSHOT_HOST : 'charles';
const SCREENSHOT_PORT = env.SCREENSHOT_PORT ? env.SCREENSHOT_PORT : 8000;
const SCREENSHOTTER_BASEURL = env.SCREENSHOTTER_BASEURL ? env.SCREENSHOTTER_BASEURL : 'http://screenshotter';
const EXTERNAL_BASEURL = `http://localhost:${PORT}`;

// Database configuration
// ----------------------

const DB_ADAPTER = env.DB_ADAPTER ? env.DB_ADAPTER : 'postgresql';
const DB_HOST = env.DB_HOST ? env.DB_HOST : 'localhost';
const DB_PORT = env.DB_PORT ? parseInt(env.DB_PORT, 10) : 5432;
const DB_USER = env.DB_USER ? env.DB_USER : 'gitlab';
const DB_PASS = env.DB_PASS ? env.DB_PASS : 'password';
const DB_NAME = env.DB_NAME ? env.DB_NAME : 'gitlabhq_production';
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

const DEPLOYMENT_FOLDER = env.DEPLOYMENT_FOLDER ? env.DEPLOYMENT_FOLDER : '/deployments/';
const SCREENSHOT_FOLDER = env.SCREENSHOT_FOLDER ? env.SCREENSHOT_FOLDER : '/screenshots/';

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
  kernel.bind(screenshotterBaseurlInjectSymbol).toConstantValue(SCREENSHOTTER_BASEURL);
  kernel.bind(externalBaseUrlInjectSymbol).toConstantValue(EXTERNAL_BASEURL);
};
