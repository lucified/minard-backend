
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import DeploymentModule from './deployment-module';


@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;

  constructor(@inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule) {
    this.deploymentModule = deploymentModule;
    this.register.attributes = {
      name: 'deployment-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'GET',
      path: '/deployments/{projectId}',
      handler: {
        async: this.getDeploymentsHandler.bind(this),
      },
    });
    next();
  };

  public async getDeploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const params = <any>request.params;
    const projectId = params.projectId;
    return reply(this.deploymentModule.handleGetDeployments(projectId));
  }

}

export default DeploymentHapiPlugin;

