
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import DeploymentJsonApi from './deployment-json-api';
import DeploymentModule, { DeploymentKey, getDeploymentKey, isRawDeploymentHostname} from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';

import { proxyCI } from './proxy-ci';
import * as path from 'path';

const directoryHandler = require('inert/lib/directory').handler;

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;
  private deploymentJsonApi: DeploymentJsonApi;
  private gitlabHost: string;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(DeploymentJsonApi.injectSymbol) deploymentJsonApi: DeploymentJsonApi,
    @inject(gitlabHostInjectSymbol) gitlabHost: string ) {

    this.deploymentModule = deploymentModule;
    this.deploymentJsonApi = deploymentJsonApi;
    this.gitlabHost = gitlabHost;

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
      path: '/project/{projectId}/deployments',
      handler: {
        async: this.getProjectDeploymentsHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/project/{projectId}/deployments/{deploymentId}',
      handler: {
        async: this.getDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/raw-deployment-handler/{param*}',
      handler: {
        async: this.rawDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: '*',
      path: '/ci/api/v1/{what}/{id}/{action?}',
      handler: proxyCI.bind(null, this.gitlabHost,
        this.deploymentModule.setDeploymentState.bind(this.deploymentModule)),
      config: {
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    next();
  };

  public async rawDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKey(request.info.hostname) as DeploymentKey;
    const projectId = key.projectId;
    const deploymentId = key.deploymentId;

    if (!key) {
      return reply({
        status: 403,
        message: `Could not parse deployment URL from hostname '${request.info.hostname}'`});
    }

    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);
    if (!isReady) {
      try {
        await this.deploymentModule.prepareDeploymentForServing(projectId, deploymentId);
        console.log(`Prepared deployment for serving (projectId: ${projectId}, deploymentId: ${deploymentId})`);
    } catch (err) {
       return reply({ status: 404, message: err.message }).code(404);
      }
    }
    // for now we only support projects that create the artifact in 'dist' folder
    const distPath = path.join(this.deploymentModule
      .getDeploymentPath(projectId, deploymentId), 'dist');
    const dirHandlerOptions = {
      path: distPath,
      listing: true,
    };
    const dirHandler = directoryHandler(request.route, dirHandlerOptions);
    return dirHandler(request, reply);
  }

  private async getProjectDeploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const projectId = (<any> request.params).projectId;
    return reply(this.deploymentJsonApi.getProjectDeployments(projectId));
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    const deploymentId = (<any> request.params).deploymentId;
    return reply(this.deploymentJsonApi.getDeployment(projectId, deploymentId));
  }

}

export default DeploymentHapiPlugin;
