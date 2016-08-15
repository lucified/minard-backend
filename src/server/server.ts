
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';
import * as stream from 'stream';

import { CIProxy } from '../deployment';
import DeploymentPlugin from '../deployment/deployment-hapi-plugin';
import { JsonApiHapiPlugin as JsonApiPlugin } from '../json-api';
import ProjectPlugin from '../project/project-hapi-plugin';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { StatusHapiPlugin as StatusPlugin } from '../status';

const hapiAsyncHandler = require('hapi-async-handler');
const inert = require('inert');
const h2o2 = require('h2o2');
const good = require('good');

export const hostInjectSymbol = Symbol('server-host');
export const portInjectSymbol = Symbol('server-port');
export const goodOptionsInjectSymbol = Symbol('good-options');

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

  private statusPlugin: StatusPlugin;
  private projectPlugin: ProjectPlugin;
  private deploymentPlugin: DeploymentPlugin;
  private jsonApiPlugin: JsonApiPlugin;
  private ciProxy: CIProxy;
  private port: number;
  private host: string;
  private goodOptions: any;
  private logger: Logger;

  constructor(
    @inject(DeploymentPlugin.injectSymbol) deploymentPlugin: DeploymentPlugin,
    @inject(ProjectPlugin.injectSymbol) projectPlugin: ProjectPlugin,
    @inject(JsonApiPlugin.injectSymbol) jsonApiPlugin: JsonApiPlugin,
    @inject(CIProxy.injectSymbol) ciProxy: CIProxy,
    @inject(hostInjectSymbol) host: string,
    @inject(portInjectSymbol) port: number,
    @inject(StatusPlugin.injectSymbol) statusPlugin: StatusPlugin,
    @inject(goodOptionsInjectSymbol) goodOptions: any,
    @inject(loggerInjectSymbol) logger: Logger) {
    this.deploymentPlugin = deploymentPlugin;
    this.projectPlugin = projectPlugin;
    this.jsonApiPlugin = jsonApiPlugin;
    this.ciProxy = ciProxy;
    this.statusPlugin = statusPlugin;
    this.host = host;
    this.port = port;
    this.goodOptions = goodOptions;
    this.logger = logger;
  }

  public async start(): Promise<Hapi.Server> {
    const options = {};
    const server = new Hapi.Server(options);
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

    this.logger.info(`Server running at: ${server.info.uri}`);
    return server;
  };

  private async loadBasePlugins(server: Hapi.Server) {

    await server.register([
      { register: hapiAsyncHandler },
      { register: h2o2 },
      { register: inert },
      {
        register: good,
        options: this.goodOptions,
      },
    ]);
  };

  private async loadAppPlugins(server: Hapi.Server) {
    await server.register([
      this.deploymentPlugin.register,
      this.projectPlugin.register,
      this.ciProxy.register,
      this.statusPlugin.register]);

    await (<any> server).register(this.jsonApiPlugin.register, {
      routes: {
        prefix: '/api',
      },
    });

  }

}
