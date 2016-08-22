
import * as Boom from 'boom';
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import DeploymentModule, {
  getDeploymentKeyFromHost,
  getDeploymentKeyFromId,
  isRawDeploymentHostname }
from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';

import * as path from 'path';

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;
  private gitlabHost: string;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(gitlabHostInjectSymbol) gitlabHost: string) {

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
        directory: {
          path: this.serveDirectory.bind(this),
          index: true,
          listing: true,
          showHidden: false,
          redirectToSlash: false,
          lookupCompressed: false,
        },
      },
      config: {
        pre: [
          { method: this.parseHost.bind(this), assign: 'key' },
          { method: this.preCheck.bind(this) },
        ],
      },
    });

    server.route({
      method: 'GET',
      path: '/deployments/{id}/{path*}',
      handler: {
        directory: {
          path: this.serveDirectory.bind(this),
          index: true,
          listing: true,
          showHidden: false,
          redirectToSlash: false,
          lookupCompressed: false,
        },
      },
      config: {
        pre: [
          { method: this.parsePath.bind(this), assign: 'key' },
          { method: this.preCheck.bind(this) },
        ],
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
      `);
      },
    });

    next();
  };

  private serveDirectory(request: Hapi.Request) {
    const pre = <any> request.pre;
    const projectId = pre.key.projectId;
    const deploymentId = pre.key.deploymentId;
    return this.distPath(projectId, deploymentId);
  }

  private distPath(projectId: number, deploymentId: number) {
    // for now we only support projects that create the artifact in 'dist' folder
    return path.join(this.deploymentModule
      .getDeploymentPath(projectId, deploymentId), 'dist');

  }

  private parsePath(request: Hapi.Request, reply: Hapi.IReply) {
    const params = request.params;
    const idKey = 'id';
    const id = params[idKey];

    const key = getDeploymentKeyFromId(id);

    if (!key) {
      return Boom.create(403, `Could not parse deployment URL from id '${id}'`) as any;
    }
    // This hack is needed so that the directory-handler doesn't take the id as the path
    if (request.paramsArray.length < 2) {
      request.paramsArray.push('');
    }
    return reply(key);
  }

  private parseHost(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKeyFromHost(request.info.hostname);

    if (!key) {
      return reply(Boom.create(
        403,
        `Could not parse deployment URL from hostname '${request.info.hostname}'`
      ));
    }
    return reply(key);
  }

  private async preCheck(request: Hapi.Request, reply: Hapi.IReply) {
    const pre = <any> request.pre;
    const projectId = pre.key.projectId;
    const deploymentId = pre.key.deploymentId;
    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);

    if (!isReady) {
      try {
        await this.deploymentModule.prepareDeploymentForServing(projectId, deploymentId);
        console.log(`Prepared deployment for serving (projectId: ${projectId}, deploymentId: ${deploymentId})`);
      } catch (err) {
        return reply(Boom.notFound(err.message));
      }
    }
    return reply('ok');
  }
}

export default DeploymentHapiPlugin;
