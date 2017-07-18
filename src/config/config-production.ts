import { caching } from 'cache-manager';
import { Container } from 'inversify';
import * as Knex from 'knex';
import { parse as parseUrl } from 'url';
import { transports } from 'winston';

import {
  auth0AudienceInjectSymbol,
  auth0ClientIdInjectSymbol,
  auth0DomainInjectSymbol,
  authCookieDomainInjectSymbol,
  gitlabRootPasswordInjectSymbol,
  internalHostSuffixesInjectSymbol,
} from '../authentication';
import {
  deploymentFolderInjectSymbol,
  deploymentUrlPatternInjectSymbol,
} from '../deployment';
import { eventStoreConfigInjectSymbol } from '../event-bus';
import {
  githubTokensInjectSymbol,
  gitSyncerBaseUrlInjectSymbol,
} from '../github-sync/types';
import {
  screenshotFolderInjectSymbol,
  screenshotterBaseurlInjectSymbol,
  screenshotUrlPattern,
} from '../screenshot';
import {
  exitDelayInjectSymbol,
  externalBaseUrlInjectSymbol,
  goodOptionsInjectSymbol,
  hostInjectSymbol,
  minardUiBaseUrlInjectSymbol,
  portInjectSymbol,
} from '../server';
import { cacheInjectSymbol } from '../shared/cache';
import {
  gitBaseUrlInjectSymbol,
  gitlabHostInjectSymbol,
  gitlabPasswordSecretInjectSymbol,
  gitVhostInjectSymbol,
} from '../shared/gitlab-client';
import Logger, { loggerInjectSymbol } from '../shared/logger';
import { tokenSecretInjectSymbol } from '../shared/token-generator';
import {
  adminIdInjectSymbol,
  charlesDbNameInjectSymbol,
  charlesKnexInjectSymbol,
  gitlabKnexInjectSymbol,
  postgresKnexInjectSymbol,
} from '../shared/types';
import { sentryDsnInjectSymbol } from '../shared/types';
import { systemHookBaseUrlSymbol } from '../system-hook/system-hook-module';
import { FilterStream } from './utils';

const redisStore = require('cache-manager-redis');

// Logging configuration
// ---------------------

function requestFilter(data: any) {
  // filter out runner's requests for new build jobs
  if (
    data.path &&
    data.path.indexOf('/ci/api/v1/builds/register.json') !== -1 &&
    data.statusCode === 404
  ) {
    return false;
  }
  // filter out successful health checks
  if (
    data.path &&
    data.path.indexOf('/status') === 0 &&
    data.statusCode === 200
  ) {
    return false;
  }
  if (
    data.path &&
    data.path.indexOf('/health') === 0 &&
    data.statusCode === 200
  ) {
    return false;
  }
  return true;
}

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
            request: '*',
          },
        ],
      },
      {
        module: 'good-console',
        args: [{ format: 'DD.MM HH:mm:ss', utc: false, color: true }],
      },
      'stdout',
    ],
  },
};

const winstonOptions = {
  transports: [
    new transports.Console({
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
const HOST = env.HOST || '0.0.0.0';
const PORT = env.PORT ? parseInt(env.PORT, 10) : 8000;

// Host and port from which charles can reach GitLab
const GITLAB_HOST = env.GITLAB_HOST || 'localhost';
const GITLAB_PORT = env.GITLAB_PORT ? parseInt(env.GITLAB_PORT, 10) : 10080;

// Host loopback IP, used only for local development to define other environment variables
const HOST_LOOPBACK_IP = process.env.HOST_LOOPBACK_IP;

// Base URL for systemhooks registered to GitLab. This must be an URL from
// which GitLab can reach charles.
const SYSTEMHOOK_BASEURL =
  env.SYSTEMHOOK_BASEURL || `http://${HOST_LOOPBACK_IP}:${PORT}`;

// Base URL for the screenshotter service
const SCREENSHOTTER_BASEURL =
  env.SCREENSHOTTER_BASEURL || 'http://localhost:8002';

// Generic external base URL for charles
const EXTERNAL_BASEURL = env.EXTERNAL_BASEURL || `http://localhost:${PORT}`;

// External baseUrl for git urls
const EXTERNAL_GIT_BASEURL =
  env.EXTERNAL_GIT_BASEURL || `http://localhost:${GITLAB_PORT}`;

// External hostname for git urls, e.g. git.minard.io
const GIT_VHOST = env.GIT_VHOST || parseUrl(EXTERNAL_GIT_BASEURL).hostname;

// A secret for generating gitlab passwords
const GITLAB_PASSWORD_SECRET = env.GITLAB_PASSWORD_SECRET || 'abcdefg';

const deploymentDomain = `deployment.localtest.me`;

// URL pattern used for composing EXTERNAL deployment URLs
// Users access deployments via urls matching this pattern
const DEPLOYMENT_URL_PATTERN =
  env.DEPLOYMENT_URL_PATTERN || `http://%s.${deploymentDomain}:${PORT}`;

// URL pattern used for composing EXTERNAL URLs for screenshots
const SCREENSHOT_URL_PATTERN =
  env.SCREENSHOT_URL_PATTERN || `http://%s.${deploymentDomain}:${PORT}`;

// Base URL for minard-ui
const MINARD_UI_BASEURL = env.MINARD_UI_BASEURL || `http://localhost:3000`;

// Host header suffixes that will result in a request
// being considered as coming from a trusted internal network
//
// (This is secure, when the load balancer uses host headers to
//  route external traffic, preventing external clients from sending
//  arbitrary host headers)
const INTERNAL_HOST_SUFFIXES =
  env.INTERNAL_HOST_SUFFIXES ||
  'charles,charles.internal,internal.localtest.me';

// Database configuration
// ----------------------

const DB_ADAPTER = env.DB_ADAPTER || 'postgresql';
const DB_HOST = env.DB_HOST || 'localhost';
const DB_PORT = env.DB_PORT ? parseInt(env.DB_PORT, 10) : 15432;
const DB_USER = env.DB_USER || 'gitlab';
const DB_PASS = env.DB_PASS || 'password';
const DB_NAME = env.DB_NAME || 'gitlabhq_production';
const CHARLES_DB_NAME = env.CHARLES_DB_NAME || 'charles';

function getKnex(dbName: string) {
  return Knex({
    client: DB_ADAPTER,
    connection: {
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
      database: dbName,
      port: DB_PORT,
    },
    pool: {
      min: 2,
      max: 10,
      bailAfter: Infinity,
      acquireTimeout: 5 * 1000,
    } as any,
  });
}

const gitlabKnex = getKnex(DB_NAME);
const charlesKnex = getKnex(CHARLES_DB_NAME);
const postgresKnex = getKnex('postgres');

// EventStore / Redis configuration
//
// Reference:
//  (a) https://github.com/adrai/node-eventstore
//  (b) http://redis.js.org/#api-rediscreateclient
//
// -----------------------------------------------
const REDIS_HOST = env.REDIS_HOST || 'localhost';
const REDIS_PORT = env.REDIS_PORT ? parseInt(env.REDIS_PORT, 10) : 6379;

const eventStoreConfig = {
  type: 'redis',
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: 0,
  prefix: 'charles',
  eventsCollectionName: 'events',
  snapshotsCollectionName: 'snapshots',
  retry_strategy: (options: any): Error | number | undefined => {
    if (options.error.code === 'ECONNREFUSED') {
      // End reconnecting on a specific error and flush all commands with a individual error
      return new Error('The server refused the connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      // End reconnecting after a specific timeout and flush all commands with a individual error
      return new Error('Retry time exhausted');
    }
    if (options.times_connected > 10) {
      // End reconnecting with built in error
      return undefined;
    }
    // reconnect after
    return Math.max(options.attempt * 100, 3000);
  },
};

// Filesystem configuration
// ------------------------

const DEPLOYMENT_FOLDER =
  env.DEPLOYMENT_FOLDER || 'gitlab-data/charles/deployments/';
const SCREENSHOT_FOLDER =
  env.SCREENSHOT_FOLDER || 'gitlab-data/charles/screenshots/';

// Redis cache
// -----------

const cache = caching(
  {
    store: redisStore,
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: 1,
    ttl: 60 * 60 * 24 * 30, // 30 days
  } as any,
);

// Authentication
// --------------

const GITLAB_ROOT_PASSWORD = env.GITLAB_ROOT_PASSWORD || '12345678';
const AUTH0_DOMAIN = env.AUTH0_DOMAIN || 'https://lucify-dev.eu.auth0.com';
const AUTH0_CLIENT_ID =
  env.AUTH0_CLIENT_ID || 'ZaeiNyV7S7MpI69cKNHr8wXe5Bdr8tvW';
const AUTH0_AUDIENCE = env.AUTH0_AUDIENCE || EXTERNAL_BASEURL;
const AUTH_COOKIE_DOMAIN = env.AUTH_COOKIE_DOMAIN || AUTH0_AUDIENCE;

// Url token secret
// ----------------

const TOKEN_SECRET = env.TOKEN_SECRET || DB_PASS;

// Sentry
// --------------

const SENTRY_DSN = env.SENTRY_DSN || undefined;

// Exit delay
// --------------

const EXIT_DELAY = env.EXIT_DELAY ? parseInt(env.EXIT_DELAY, 10) : 15000;

// Admin team name
// --------------

const ADMIN_ID = env.ADMIN_ID;

// GitHub integration
// ------------------

const GIT_SYNCER_BASEURL = process.env.GIT_SYNCER_BASEURL;

// format for GITHUB_TOKENS is 1=token-for-first-team,2=token-for-second-team,
// where teamId are numeric teamId:s, and the tokens are the team's GitHub access tokens
const GITHUB_TOKENS = process.env.GITHUB_TOKENS;

// Inversify kernel bindings
// -------------------------

export default (kernel: Container) => {
  kernel.bind(eventStoreConfigInjectSymbol).toConstantValue(eventStoreConfig);
  kernel.bind(goodOptionsInjectSymbol).toConstantValue(goodOptions);
  kernel.bind(loggerInjectSymbol).toConstantValue(Logger(winstonOptions));
  kernel.bind(hostInjectSymbol).toConstantValue(HOST);
  kernel.bind(portInjectSymbol).toConstantValue(PORT);
  kernel
    .bind(gitlabHostInjectSymbol)
    .toConstantValue(`http://${GITLAB_HOST}:${GITLAB_PORT}`);
  kernel.bind(gitVhostInjectSymbol).toConstantValue(GIT_VHOST);
  kernel
    .bind(gitlabPasswordSecretInjectSymbol)
    .toConstantValue(GITLAB_PASSWORD_SECRET);
  kernel.bind(systemHookBaseUrlSymbol).toConstantValue(SYSTEMHOOK_BASEURL);
  kernel.bind(deploymentFolderInjectSymbol).toConstantValue(DEPLOYMENT_FOLDER);
  kernel.bind(gitlabKnexInjectSymbol).toConstantValue(gitlabKnex);
  kernel.bind(charlesKnexInjectSymbol).toConstantValue(charlesKnex);
  kernel.bind(charlesDbNameInjectSymbol).toConstantValue(CHARLES_DB_NAME);
  kernel.bind(postgresKnexInjectSymbol).toConstantValue(postgresKnex);
  kernel.bind(screenshotFolderInjectSymbol).toConstantValue(SCREENSHOT_FOLDER);
  kernel
    .bind(screenshotterBaseurlInjectSymbol)
    .toConstantValue(SCREENSHOTTER_BASEURL);
  kernel.bind(externalBaseUrlInjectSymbol).toConstantValue(EXTERNAL_BASEURL);
  kernel
    .bind(deploymentUrlPatternInjectSymbol)
    .toConstantValue(DEPLOYMENT_URL_PATTERN);
  kernel.bind(screenshotUrlPattern).toConstantValue(SCREENSHOT_URL_PATTERN);
  kernel.bind(gitBaseUrlInjectSymbol).toConstantValue(EXTERNAL_GIT_BASEURL);
  kernel.bind(cacheInjectSymbol).toConstantValue(cache);
  kernel.bind(minardUiBaseUrlInjectSymbol).toConstantValue(MINARD_UI_BASEURL);
  kernel
    .bind(gitlabRootPasswordInjectSymbol)
    .toConstantValue(GITLAB_ROOT_PASSWORD);
  kernel.bind(sentryDsnInjectSymbol).toConstantValue(SENTRY_DSN);
  kernel.bind(exitDelayInjectSymbol).toConstantValue(EXIT_DELAY);
  kernel.bind(tokenSecretInjectSymbol).toConstantValue(TOKEN_SECRET);
  kernel.bind(auth0DomainInjectSymbol).toConstantValue(AUTH0_DOMAIN);
  kernel.bind(auth0ClientIdInjectSymbol).toConstantValue(AUTH0_CLIENT_ID);
  kernel.bind(auth0AudienceInjectSymbol).toConstantValue(AUTH0_AUDIENCE);
  kernel.bind(authCookieDomainInjectSymbol).toConstantValue(AUTH_COOKIE_DOMAIN);
  kernel.bind(adminIdInjectSymbol).toConstantValue(ADMIN_ID);
  kernel
    .bind(internalHostSuffixesInjectSymbol)
    .toConstantValue(INTERNAL_HOST_SUFFIXES.split(','));
  kernel.bind(githubTokensInjectSymbol).toConstantValue(GITHUB_TOKENS);
  kernel.bind(gitSyncerBaseUrlInjectSymbol).toConstantValue(GIT_SYNCER_BASEURL);
};
