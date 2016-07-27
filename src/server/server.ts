
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import DeploymentPlugin from '../deployment/deployment-hapi-plugin';
import HelloPlugin from '../hello/hello-hapi-plugin';
import ProjectPlugin from '../project/project-hapi-plugin';

const hapiAsyncHandler = require('hapi-async-handler');

@injectable()
export default class MinardServer {
  public static injectSymbol = Symbol('minard-server');

  private helloPlugin: HelloPlugin;
  private projectPlugin: ProjectPlugin;
  private deploymentPlugin: DeploymentPlugin;

  constructor(
    @inject(HelloPlugin.injectSymbol) helloPlugin: HelloPlugin,
    @inject(DeploymentPlugin.injectSymbol) deploymentPlugin: DeploymentPlugin,
    @inject(ProjectPlugin.injectSymbol) projectPlugin: ProjectPlugin) {
    this.helloPlugin = helloPlugin;
    this.deploymentPlugin = deploymentPlugin;
    this.projectPlugin = projectPlugin;
  }

  public async start(): Promise<Hapi.Server> {
    const options = {
      debug: {
        log: ['error'],
        request: ['error'],
      },
    };

    const server = new Hapi.Server(options);
    const args = process.argv.slice(2); // drop binary and filename
    server.connection({
      host: args[0] || '0.0.0.0',
      port: args[1] ? parseInt(args[1], 10) : 8000,
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
    await server.register(hapiAsyncHandler);
  };

  private async loadAppPlugins(server: Hapi.Server) {
    await server.register([
      this.helloPlugin.register,
      this.deploymentPlugin.register,
      this.projectPlugin.register,
      ]);
  }

}
