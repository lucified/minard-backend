
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { CIProxy } from '../deployment';
import DeploymentPlugin from '../deployment/deployment-hapi-plugin';
import HelloPlugin from '../hello/hello-hapi-plugin';
import { JsonApiHapiPlugin as JsonApiPlugin } from '../json-api';
import ProjectPlugin from '../project/project-hapi-plugin';

const hapiAsyncHandler = require('hapi-async-handler');
const inert = require('inert');
const h2o2 = require('h2o2');
const good = require('good');

export const hostInjectSymbol = Symbol();
export const portInjectSymbol = Symbol();

@injectable()
export default class MinardServer {
  public static injectSymbol = Symbol('minard-server');

  private helloPlugin: HelloPlugin;
  private projectPlugin: ProjectPlugin;
  private deploymentPlugin: DeploymentPlugin;
  private jsonApiPlugin: JsonApiPlugin;
  private ciProxy: CIProxy;
  private port: number;
  private host: string;

  constructor(
    @inject(HelloPlugin.injectSymbol) helloPlugin: HelloPlugin,
    @inject(DeploymentPlugin.injectSymbol) deploymentPlugin: DeploymentPlugin,
    @inject(ProjectPlugin.injectSymbol) projectPlugin: ProjectPlugin,
    @inject(JsonApiPlugin.injectSymbol) jsonApiPlugin: JsonApiPlugin,
    @inject(CIProxy.injectSymbol) ciProxy: CIProxy,
    @inject(hostInjectSymbol) host: string,
    @inject(portInjectSymbol) port: number) {
    this.helloPlugin = helloPlugin;
    this.deploymentPlugin = deploymentPlugin;
    this.projectPlugin = projectPlugin;
    this.jsonApiPlugin = jsonApiPlugin;
    this.ciProxy = ciProxy;
    this.host = host;
    this.port = port;
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

    console.log('Server running at:', server.info.uri);
    return server;
  };

  private async loadBasePlugins(server: Hapi.Server) {

    await server.register([
      { register: hapiAsyncHandler },
      { register: h2o2 },
      { register: inert },
      {
        register: good,
        options: {
          reporters: {
            console: [
              {
                module: 'good-squeeze',
                name: 'Squeeze',
                args: [
                  {
                    log: '*',
                    response: '*',
                    error: '*',
                  },
                ],
              },
              {
                module: 'good-console',
              },
              'stdout',
            ],
          },
        },
      },
    ]);
  };

  private async loadAppPlugins(server: Hapi.Server) {
    await server.register([
      this.helloPlugin.register,
      this.deploymentPlugin.register,
      this.projectPlugin.register,
      this.ciProxy.register]);

    await (<any> server).register(this.jsonApiPlugin.register, {
      routes: {
        prefix: '/api',
      },
    });

  }

}
