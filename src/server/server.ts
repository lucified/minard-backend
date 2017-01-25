import { inject, injectable } from 'inversify';

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

@injectable()
export default class MinardServer {
  public static injectSymbol = Symbol('minard-server');

  private readonly authenticationPlugin: AuthenticationHapiPlugin;
  private readonly statusPlugin: StatusHapiPlugin;
  private readonly projectPlugin: ProjectHapiPlugin;
  private readonly deploymentPlugin: DeploymentHapiPlugin;
  private readonly jsonApiPlugin: JsonApiHapiPlugin;
  private readonly screenshotPlugin: ScreenshotHapiPlugin;
  private readonly operationsPlugin: OperationsHapiPlugin;
  private readonly realtimePlugin: RealtimeHapiPlugin;
  private readonly ciProxy: CIProxy;
  private readonly port: number;
  private readonly host: string;
  private readonly goodOptions: any;
  private readonly sentryDsn: string;
  private readonly exitDelay: number;
  public readonly logger: Logger;

  private hapiServer: Hapi.Server;

  constructor(
    @inject(AuthenticationHapiPlugin.injectSymbol) authenticationPlugin: AuthenticationHapiPlugin,
    @inject(DeploymentHapiPlugin.injectSymbol) deploymentPlugin: DeploymentHapiPlugin,
    @inject(ProjectHapiPlugin.injectSymbol) projectPlugin: ProjectHapiPlugin,
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(CIProxy.injectSymbol) ciProxy: CIProxy,
    @inject(hostInjectSymbol) host: string,
    @inject(portInjectSymbol) port: number,
    @inject(StatusHapiPlugin.injectSymbol) statusPlugin: StatusHapiPlugin,
    @inject(goodOptionsInjectSymbol) goodOptions: any,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(ScreenshotHapiPlugin.injectSymbol) screenshotPlugin: ScreenshotHapiPlugin,
    @inject(OperationsHapiPlugin.injectSymbol) operationsPlugin: OperationsHapiPlugin,
    @inject(RealtimeHapiPlugin.injectSymbol) realtimePlugin: RealtimeHapiPlugin,
    @inject(sentryDsnInjectSymbol) sentryDsn: string,
    @inject(exitDelayInjectSymbol) exitDelay: number,
    ) {
    this.authenticationPlugin = authenticationPlugin;
    this.deploymentPlugin = deploymentPlugin;
    this.projectPlugin = projectPlugin;
    this.jsonApiPlugin = jsonApiPlugin;
    this.ciProxy = ciProxy;
    this.statusPlugin = statusPlugin;
    this.screenshotPlugin = screenshotPlugin;
    this.operationsPlugin = operationsPlugin;
    this.realtimePlugin = realtimePlugin;
    this.host = host;
    this.port = port;
    this.goodOptions = goodOptions;
    this.logger = logger;
    this.sentryDsn = sentryDsn;
    this.exitDelay = exitDelay;
  }

  public async start(): Promise<Hapi.Server> {
    const options = {};
    const server = this.hapiServer = Hapi.getServer(options);
    server.connection({
      host: this.host,
      port: this.port,
      routes: {
        json: {
          space: 4,
        },
      },
    });

    server.ext('onPreStop', async (_server, next) => {
      this.logger.debug('Starting exit delay');
      await sleep(this.exitDelay);
      this.logger.debug('Exit delay finished');
      return next();
    });

    await this.loadBasePlugins(server);
    await this.loadAppPlugins(server);
    await this.operationsPlugin.operationsModule.cleanupRunningDeployments();

    await server.start();
    this.logger.info('Charles is up and listening on %s', server.info.uri);
    return server;
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
    let ravenRegister: any = undefined;
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
      this.projectPlugin.register,
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

}
