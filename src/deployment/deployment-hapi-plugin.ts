
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import DeploymentModule, { getDeploymentKey, isRawDeploymentHostname} from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';

import * as path from 'path';

const directoryHandler = require('inert/lib/directory').handler;

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;
  private gitlabHost: string;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(gitlabHostInjectSymbol) gitlabHost: string ) {

    this.deploymentModule = deploymentModule;
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
      path: '/raw-deployment-handler/{param*}',
      handler: {
        async: this.rawDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/ci/projects/{id}/{ref}/{sha}/{action}',
      handler: (request: Hapi.Request, reply: Hapi.IReply) => {
        const actionKey = 'action';
        if (request.params[actionKey] !== 'yml') {
          return reply(404);
        }
        return reply(`
image: node:latest
cache:
  paths:
  - node_modules/
my_job:
  script:
   - echo MONOLITH
   - npm install
   - npm run-script build
  artifacts:
    name: "artifact-name"
    paths:
      - dist/
      `); },
    });

    next();
  };

  public async rawDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKey(request.info.hostname);

    if (!key) {
      return reply({
        status: 403,
        message: `Could not parse deployment URL from hostname '${request.info.hostname}'`});
    }

    const projectId = key.projectId;
    const deploymentId = key.deploymentId;
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

}

export default DeploymentHapiPlugin;
