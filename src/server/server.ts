import { inject, injectable } from 'inversify';
import * as stream from 'stream';

import { CIProxy } from '../deployment';
import { DeploymentHapiPlugin } from '../deployment';
import { JsonApiHapiPlugin } from '../json-api';
import { OperationsHapiPlugin } from '../operations';
import { ProjectHapiPlugin } from '../project';
import { RealtimeHapiPlugin } from '../realtime';
import { ScreenshotHapiPlugin } from '../screenshot';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { sentryDsnInjectSymbol } from '../shared/types';
import { StatusHapiPlugin } from '../status';

const inert = require('inert');
const h2o2 = require('h2o2');
const good = require('good');
const hapiSentry = require('hapi-raven');
const WinstonSentry = require('winston-sentry'); // tslint:disable-line

import * as Hapi from './hapi';
import {
  goodOptionsInjectSymbol,
  hostInjectSymbol,
  portInjectSymbol,
} from './types';

class FilterStream extends stream.Transform {

  constructor() {
    const options = {
      objectMode: true,
    };
    super(options);
  }

  public _transform(data: any, _enc: any, next: any) {
    if (data.path
      && data.path.indexOf('/ci/api/v1/builds/register.json') !== -1
      && data.statusCode === 404) {
      return next(null);
    }
    next(null, data);
  }
}

@injectable()
export default class MinardServer {
  public static injectSymbol = Symbol('minard-server');

  private statusPlugin: StatusHapiPlugin;
  private projectPlugin: ProjectHapiPlugin;
  private deploymentPlugin: DeploymentHapiPlugin;
  private jsonApiPlugin: JsonApiHapiPlugin;
  private screenshotPlugin: ScreenshotHapiPlugin;
  private operationsPlugin: OperationsHapiPlugin;
  private realtimePlugin: RealtimeHapiPlugin;
  private ciProxy: CIProxy;
  private port: number;
  private host: string;
  private goodOptions: any;
  private readonly sentryDsn: string;
  public readonly logger: Logger;

  constructor(
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
    @inject(sentryDsnInjectSymbol) sentryDsn: string) {
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
  }

  public async start(): Promise<Hapi.Server> {
    const options = {};
    const server = Hapi.getServer(options);
    server.connection({
      host: this.host,
      port: this.port,
      routes: {
        json: {
          space: 4,
        },
      },
    });

    await this.loadBasePlugins(server);
    await this.loadAppPlugins(server);
    await server.start();

    this.logger.info(`Charles running at: ${server.info.uri}`);
    return server;
  };

  private async loadBasePlugins(server: Hapi.Server) {

    const basePlugins = [
      { register: h2o2 },
      { register: inert },
      {
        register: good,
        options: this.goodOptions,
      },
    ];
    const ravenRegister = await this.getRaven(this.sentryDsn);

    if (ravenRegister) {
      this.logger.info('Sentry enabled');
      basePlugins.push(ravenRegister);
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
  };

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
