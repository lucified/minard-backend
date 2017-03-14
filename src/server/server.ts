import { inject, injectable, optional } from 'inversify';

import { AuthenticationHapiPlugin } from '../authentication';
import { CIProxy } from '../deployment';
import { DeploymentHapiPlugin } from '../deployment';
import { JsonApiHapiPlugin } from '../json-api';
import { OperationsHapiPlugin } from '../operations';
import { ProjectHapiPlugin } from '../project';
import { RealtimeHapiPlugin } from '../realtime';
import { ScreenshotHapiPlugin } from '../screenshot';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { sleep } from '../shared/sleep';
import { sentryDsnInjectSymbol } from '../shared/types';
import { StatusHapiPlugin } from '../status';

const inert = require('inert');
const h2o2 = require('h2o2');
const good = require('good');
const hapiSentry = require('hapi-raven');
const WinstonSentry = require('winston-sentry'); // tslint:disable-line

import * as Hapi from './hapi';
import {
  exitDelayInjectSymbol,
  goodOptionsInjectSymbol,
  hostInjectSymbol,
  portInjectSymbol,
} from './types';

export const hapiOptionsInjectSymbol = Symbol('hapi-options');

@injectable()
export default class MinardServer {

  public static injectSymbol = Symbol('minard-server');
  private readonly hapiServer: Hapi.Server;
  private readonly privateServer: Hapi.Server;
  private readonly publicServer: Hapi.Server;
  private isInitialized = false;

  constructor(
    @inject(AuthenticationHapiPlugin.injectSymbol) private readonly authenticationPlugin: AuthenticationHapiPlugin,
    @inject(DeploymentHapiPlugin.injectSymbol) private readonly deploymentPlugin: DeploymentHapiPlugin,
    @inject(ProjectHapiPlugin.injectSymbol) private readonly projectPlugin: ProjectHapiPlugin,
    @inject(JsonApiHapiPlugin.injectSymbol) private readonly jsonApiPlugin: JsonApiHapiPlugin,
    @inject(CIProxy.injectSymbol) private readonly ciProxy: CIProxy,
    @inject(hostInjectSymbol) private readonly host: string,
    @inject(portInjectSymbol) private readonly port: number,
    @inject(StatusHapiPlugin.injectSymbol) private readonly statusPlugin: StatusHapiPlugin,
    @inject(goodOptionsInjectSymbol) private readonly goodOptions: any,
    @inject(loggerInjectSymbol) public readonly logger: Logger,
    @inject(ScreenshotHapiPlugin.injectSymbol) private readonly screenshotPlugin: ScreenshotHapiPlugin,
    @inject(OperationsHapiPlugin.injectSymbol) private readonly operationsPlugin: OperationsHapiPlugin,
    @inject(RealtimeHapiPlugin.injectSymbol) private readonly realtimePlugin: RealtimeHapiPlugin,
    @inject(sentryDsnInjectSymbol) private readonly sentryDsn: string,
    @inject(exitDelayInjectSymbol) private readonly exitDelay: number,
    @inject(hapiOptionsInjectSymbol) @optional() hapiOptions?: Hapi.IServerOptions,
  ) {

    this.hapiServer = Hapi.getServer(hapiOptions);
    this.publicServer = this.hapiServer.connection({
      host: this.host,
      port: this.port,
      labels: ['public'],
      routes: {
        json: {
          space: 4,
        },
      },
    });
    this.privateServer = this.hapiServer.connection({
      host: this.host,
      port: this.port + 1,
      labels: ['private'],
      routes: {
        json: {
          space: 4,
        },
      },
    });
  }

  public async start(): Promise<Hapi.Server> {
    const server = this.hapiServer;

    server.ext('onPreStop', async (_server, next) => {
      this.logger.debug('Starting exit delay');
      await sleep(this.exitDelay);
      this.logger.debug('Exit delay finished');
      return next();
    });

    await this.initialize();
    await server.start();
    this.logger.info('Charles public is up and listening on %s', this.publicServer.info.uri);
    this.logger.info('Charles private is up and listening on %s', this.privateServer.info.uri);
    await this.operationsPlugin.operationsModule.cleanupRunningDeployments();
    this.projectPlugin.registerHooks();
    return server;
  }

  public async initialize(): Promise<Hapi.Server> {
    if (!this.isInitialized) {
      await this.loadBasePlugins(this.hapiServer);
      await this.loadAppPlugins(this.publicServer);
      await this.loadPrivatePlugins(this.privateServer);
      this.isInitialized = true;
    }
    return this.hapiServer;
  }

  public stop(): Hapi.IPromise<void> {
    return this.hapiServer.stop();
  }

  private async loadBasePlugins(server: Hapi.Server) {

    const basePlugins = [
      { register: h2o2 },
      { register: inert },
      {
        register: good,
        options: this.goodOptions,
      },
    ];
    let ravenRegister: any;
    if (this.sentryDsn) {
      ravenRegister = await this.getRaven(this.sentryDsn);

      if (ravenRegister) {
        this.logger.info('Sentry enabled');
        basePlugins.push(ravenRegister);
      }
    }
    await server.register(basePlugins);

    if (ravenRegister) {
      const ravenClientKey = 'hapi-raven';
      const raven = server.plugins[ravenClientKey].client;
      this.logger.add(new WinstonSentry({
        level: 'warn',
        raven,
      }), undefined, true);
    }
  }

  private async getRaven(dsn: string) {
    try {
      let release = 'unknown';
      let name = 'charles';
      let environment = 'development';
      try {
        const ecsStatus = await this.statusPlugin.getEcsStatus();
        if (ecsStatus) {
          const charles = ecsStatus.charles;
          release = charles.image;
          name = charles.serviceName;
          environment = charles.environment;
        }
      } catch (err) {
        this.logger.warn('Unable to get release information for Sentry: %s', err.message);
      }

      return {
        register: hapiSentry,
        options: {
          dsn,
          client: {
            name,
            environment,
            release,
          },
        },
      };
    } catch (err) {
      this.logger.warn('Unable to register Sentry: %s', err.message);
    }
    return undefined;
  }

  private async loadAppPlugins(server: Hapi.Server) {
    await server.register([
      this.authenticationPlugin.register,
      this.deploymentPlugin.register,
      this.ciProxy.register,
      this.statusPlugin.register,
      this.realtimePlugin.register,
      {
        register: this.jsonApiPlugin.register,
        routes: {
          prefix: '/api',
        },
      },
      {
        register: this.screenshotPlugin.register,
        routes: {
          prefix: '/screenshot',
        },
      },
      {
        register: this.operationsPlugin.register,
        routes: {
          prefix: '/operations',
        },
      },
    ]);
  }

  private async loadPrivatePlugins(server: Hapi.Server) {
    await server.register([
      this.deploymentPlugin.registerPrivate,
      this.statusPlugin.registerPrivate,
      this.projectPlugin.register,
    ]);
  }

}
