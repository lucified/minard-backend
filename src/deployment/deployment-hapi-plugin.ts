
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as path from 'path';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import DeploymentModule, {
  getDeploymentKeyFromHost,
  getDeploymentKeyFromId,
  isRawDeploymentHostname,
}
from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';

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

    server.ext('onRequest', (request, reply) => {
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
      path: '/ci/projects/{projectId}/{ref}/{sha}/yml',
      handler: {
        async: this.getGitlabYmlRequestHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            projectId: Joi.number().required(),
            ref: Joi.string().required(),
            sha: Joi.string(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/ci/deployments/{id}/trace',
      handler: {
        async: this.getTraceRequestHandler,
      },
      config: {
        bind: this,
        pre: [
          { method: this.parsePath.bind(this), assign: 'key' },
        ],
      },
    });
    next();
  };

  private async getGitlabYmlRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { projectId, ref } = (<any> request.params);
    return reply(this.deploymentModule.getGitlabYml(projectId, ref))
      .header('content-type', 'text/plain');
  }

  private async getTraceRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const pre = <any> request.pre;
    const projectId = pre.key.projectId;
    const deploymentId = pre.key.deploymentId;
    const text = await this.deploymentModule.getBuildTrace(projectId, deploymentId);
    return reply(text)
      .header('content-type', 'text/plain');
  }

  private serveDirectory(request: Hapi.Request) {
    const pre = <any> request.pre;
    const projectId = pre.key.projectId;
    const deploymentId = pre.key.deploymentId;
    return this.distPath(projectId, deploymentId);
  }

  private distPath(projectId: number, deploymentId: number) {
    return path.join(this.deploymentModule.getDeploymentPath(projectId, deploymentId));
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
