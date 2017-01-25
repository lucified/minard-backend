
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as path from 'path';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';

import DeploymentModule, {
  getDeploymentKeyFromHost,
  isRawDeploymentHostname,
} from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';

const memoize = require('memoizee');

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;
  private gitlabHost: string;
  private logger: Logger;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(gitlabHostInjectSymbol) gitlabHost: string,
    @inject(loggerInjectSymbol) logger: Logger) {
    this.deploymentModule = deploymentModule;
    this.gitlabHost = gitlabHost;
    this.logger = logger;

    this.register.attributes = {
      name: 'deployment-plugin',
      version: '1.0.0',
    };

    this.checkHash = memoize(this.checkHash, {
      promise: true,
      normalizer: (args: any) => `${args[0]}-${args[1]}`,
    });
  }

  public register: HapiRegister = (server, _options, next) => {

    server.ext('onRequest', (request, reply) => {
      if (isRawDeploymentHostname(request.info.hostname)) {
        // prefix the url with /raw-deployment-handler
        // (or /deployment-favicon) to allow hapi to
        // internally route the request to the correct handler
        if (request.url.href === '/favicon.ico') {
          request.setUrl('/deployment-favicon');
        } else {
          request.setUrl('/raw-deployment-handler' + request.url.href);
        }
      }
      return reply.continue();
    });

    server.route({
      method: 'GET',
      path: '/deployment-favicon',
      handler: (_request: Hapi.Request, reply: Hapi.IReply) => {
        reply.file('favicon.ico');
      },
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
      path: '/deployments/{shortId}-{projectId}-{deploymentId}/{path*}',
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
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
        pre: [
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
      path: '/ci/deployments/{projectId}-{deploymentId}/trace',
      handler: {
        async: this.getTraceRequestHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    });
    next();
  }

  private async getGitlabYmlRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { projectId, ref, sha } = (<any> request.params);
    return reply(this.deploymentModule.getGitlabYml(projectId, ref, sha))
      .header('content-type', 'text/plain');
  }

  private async getTraceRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = parseInt(request.paramsArray[0], 10);
    const deploymentId = parseInt(request.paramsArray[1], 10);
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

  private parseHost(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKeyFromHost(request.info.hostname);

    if (!key) {
      return reply(Boom.create(
        403,
        `Could not parse deployment URL from hostname '${request.info.hostname}'`,
      ));
    }
    return reply(key);
  }

  // internal method
  public async checkHash(deploymentId: number, shortId: string): Promise<boolean> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      return false;
    }
    return shortId === deployment.commit.shortId;
  }

  private async preCheck(request: Hapi.Request, reply: Hapi.IReply) {
    const pre = <any> request.pre;
    const shortId = pre ? pre.key.shortId : request.paramsArray[0];
    const projectId = pre ? pre.key.projectId : parseInt(request.paramsArray[1], 10);
    const deploymentId = pre ? pre.key.deploymentId : parseInt(request.paramsArray[2], 10);
    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);

    if (!shortId) {
      return reply(Boom.badRequest('URL is missing commit hash'));
    }

    try {
      if (!(await this.checkHash(deploymentId, shortId))) {
        this.logger.info(`checkHash failed for deployment`, { deploymentId, projectId, shortId });
        return reply(Boom.notFound('Invalid commit hash or deployment not found'));
      }
    } catch (err) {
      this.logger.error('Unexpected error in precheck', err);
      return reply(Boom.badImplementation());
    }

    if (!isReady) {
      try {
        await this.deploymentModule.prepareDeploymentForServing(projectId, deploymentId);
        this.logger.info(`Prepared deployment for serving (projectId: ${projectId}, deploymentId: ${deploymentId})`);
      } catch (err) {
        return reply(Boom.notFound(err.message));
      }
    }
    return reply('ok');
  }
}

export default DeploymentHapiPlugin;
