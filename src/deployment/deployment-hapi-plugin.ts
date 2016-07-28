
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import { DeploymentKey, default as DeploymentModule, getDeploymentKey,
  isRawDeploymentHostname} from './deployment-module';

const directoryHandler = require('inert/lib/directory').handler;

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

    server.ext('onRequest', function (request, reply) {
      if (isRawDeploymentHostname(request.info.hostname)) {
        // prefix the url with /raw-deployment-handler
        // to allow hapi to internally route the request to
        // the correct handler
        request.setUrl('/raw-deployment-handler' + request.url.href);
      }
      return reply.continue();
    });

    server.route({
      method: 'GET',
      path: '/deployments/{projectId}',
      handler: {
        async: this.getDeploymentsHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/raw-deployment-handler/{param*}',
      handler: {
        async: this.rawDeploymentHandler.bind(this),
      },
    });

    next();
  };

  public async rawDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKey(request.info.hostname) as DeploymentKey;
    const projectId = key.projectId;
    const deploymentId = key.deploymentId;
    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);
    console.log('isReady is' + isReady);
    if (!isReady) {
      try {
        await this.deploymentModule.prepareDeploymentForServing(projectId, deploymentId);
        console.log(`Prepared deployment for serving (projectId: ${projectId}, deploymentId: ${deploymentId})`);
    } catch (err) {
        return reply(err.message);
      }
    }
    const dirHandlerOptions = {
      path: `gitlab-data/monolith/${key.projectId}/${key.deploymentId}/dist`,
      listing: true,
    };
    const dirHandler = directoryHandler(request.route, dirHandlerOptions);
    return dirHandler(request, reply);
  }

  public async getDeploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const params = <any> request.params;
    const projectId = params.projectId;
    return reply(this.deploymentModule.jsonApiGetDeployments(projectId));
  }

}

export default DeploymentHapiPlugin;
