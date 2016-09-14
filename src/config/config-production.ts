
import { interfaces } from 'inversify';
import * as Knex from 'knex';
import * as winston from 'winston';

import {
  deploymentFolderInjectSymbol,
  deploymentUrlPatternInjectSymbol,
} from '../deployment';

import { externalBaseUrlInjectSymbol, goodOptionsInjectSymbol, hostInjectSymbol, portInjectSymbol} from '../server';
import { gitBaseUrlInjectSymbol, gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { loggerInjectSymbol } from '../shared/logger';
import { systemHookBaseUrlSymbol } from '../system-hook/system-hook-module';

import {
  screenshotFolderInjectSymbol,
  screenshotUrlPattern,
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
            response: '*',
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

// Host and port in which we are listening locally
const HOST = env.HOST ? env.HOST : '0.0.0.0';
const PORT = env.PORT ? parseInt(env.PORT, 10) : 8080;

// Host and port from which charles can reach GitLab
const GITLAB_HOST = env.GITLAB_HOST ? env.GITLAB_HOST : 'localhost';
const GITLAB_PORT = env.GITLAB_PORT ? parseInt(env.GITLAB_PORT, 10) : 10080;

// Host loopback IP, used only for local development to define other environment variables
const HOST_LOOPBACK_IP = process.env.HOST_LOOPBACK_IP;

// Base URL for systemhooks registered to GitLab. This must be an URL from
// which GitLab can reach charles.
const SYSTEMHOOK_BASEURL = env.SYSTEMHOOK_BASEURL ? env.SYSTEMHOOK_BASEURL : `http://${HOST_LOOPBACK_IP}:${PORT}`;

// Base URL for the screenshotter service
const SCREENSHOTTER_BASEURL = env.SCREENSHOTTER_BASEURL ? env.SCREENSHOTTER_BASEURL : 'http://localhost:8002';

// Generic external base URL for charles
const EXTERNAL_BASEURL = env.EXTERNAL_BASEURL ? env.EXTERNAL_BASEURL : `http://localhost:${PORT}`;

// External baseUrl for git clone urls
const EXTERNAL_GIT_BASEURL = env.EXTERNAL_GIT_BASEURL ? env.EXTERNAL_GIT_BASEURL : `http://localhost:${GITLAB_PORT}`;

// URL pattern used for composing external deployment URLs
// Users access deployments via urls matching this pattern
const DEPLOYMENT_URL_PATTERN = env.DEPLOYMENT_URL_PATTERN ? env.DEPLOYMENT_URL_PATTERN
  : `http://deploy-%s.${HOST_LOOPBACK_IP}.xip.io:${PORT}`;

// URL pattern used for composing deployment URLs for screenshots
const SCREENSHOT_URL_PATTERN = env.SCREENSHOT_URL_PATTERN ? env.SCREENSHOT_URL_PATTERN
  : `http://deploy-%s.${HOST_LOOPBACK_IP}.xip.io:${PORT}`;

// Database configuration
// ----------------------

const DB_ADAPTER = env.DB_ADAPTER ? env.DB_ADAPTER : 'postgresql';
const DB_HOST = env.DB_HOST ? env.DB_HOST : 'localhost';
const DB_PORT = env.DB_PORT ? parseInt(env.DB_PORT, 10) : 15432;
const DB_USER = env.DB_USER ? env.DB_USER : 'gitlab';
const DB_PASS = env.DB_PASS ? env.DB_PASS : 'password';
const DB_NAME = env.DB_NAME ? env.DB_NAME : 'gitlabhq_production';
const CHARLES_DB_NAME = env.CHARLES_DB_NAME ? env.CHARLES_DB_NAME : 'charles';

function getKnex(dbName: string) {
  return Knex({
    client: DB_ADAPTER,
    connection: {
      host     : DB_HOST,
      user     : DB_USER,
      password : DB_PASS,
      database : dbName,
      port: DB_PORT,
    },
    pool: {
      min: 2,
      max: 10,
      bailAfter: 10 * 60 * 1000,
    } as any,
  });
}

const gitlabKnex = getKnex(DB_NAME);
const charlesKnex = getKnex(CHARLES_DB_NAME);
const postgresKnex = getKnex('postgres');

// Filesystem configuration
// ------------------------

const DEPLOYMENT_FOLDER = env.DEPLOYMENT_FOLDER ? env.DEPLOYMENT_FOLDER : 'gitlab-data/charles/deployments/';
const SCREENSHOT_FOLDER = env.SCREENSHOT_FOLDER ? env.SCREENSHOT_FOLDER : 'gitlab-data/charles/screenshots/';

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
  kernel.bind('gitlab-knex').toConstantValue(gitlabKnex);
  kernel.bind('charles-knex').toConstantValue(charlesKnex);
  kernel.bind('charles-db-name').toConstantValue(CHARLES_DB_NAME);
  kernel.bind('postgres-knex').toConstantValue(postgresKnex);
  kernel.bind(screenshotFolderInjectSymbol).toConstantValue(SCREENSHOT_FOLDER);
  kernel.bind(screenshotterBaseurlInjectSymbol).toConstantValue(SCREENSHOTTER_BASEURL);
  kernel.bind(externalBaseUrlInjectSymbol).toConstantValue(EXTERNAL_BASEURL);
  kernel.bind(deploymentUrlPatternInjectSymbol).toConstantValue(DEPLOYMENT_URL_PATTERN);
  kernel.bind(screenshotUrlPattern).toConstantValue(SCREENSHOT_URL_PATTERN);
  kernel.bind(gitBaseUrlInjectSymbol).toConstantValue(EXTERNAL_GIT_BASEURL);
};
