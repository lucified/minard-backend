
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
import memoizee = require('memoizee');

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
    this.registerPrivate.attributes = {
      name: 'deployment-plugin',
      version: '1.0.0',
    };
    this.checkHash = memoizee(this.checkHash, {
      promise: true,
      normalizer: (args: any) => `${args[0]}-${args[1]}`,
    });
  }

  public register: HapiRegister = (server, _options, next) => {

    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.deploymentRoutes());

    server.route([{
      method: 'GET',
      path: '/ci/projects/{projectId}/{ref}/{sha}/yml',
      handler: {
        async: this.getGitlabYmlRequestHandler,
      },
      config: {
        bind: this,
        auth: false,
        validate: {
          params: {
            projectId: Joi.number().required(),
            ref: Joi.string().required(),
            sha: Joi.string(),
          },
        },
      },
    }, {
      method: 'GET',
      path: '/ci/deployments/{projectId}-{deploymentId}/trace',
      handler: {
        async: this.getTraceRequestHandler,
      },
      config: {
        bind: this,
        auth: false,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    }]);
    next();
  }

  private onRequest(request: Hapi.Request, reply: Hapi.IReply) {
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
  }

  private directoryHandler(preKey: string) {
    return {
      directory: {
        path: (request: Hapi.Request) => {
          const { projectId, deploymentId } = request.pre[preKey];
          return this.distPath(projectId, deploymentId);
        },
        index: true,
        listing: true,
        showHidden: false,
        redirectToSlash: false,
        lookupCompressed: false,
      },
    };
  }

  private pre(auth: boolean, host: boolean, preKey: string) {
    if (auth) {
      return [
        { method: host ? this.parseHost.bind(this) : this.parsePath.bind(this), assign: preKey },
        { method: this.authorize.bind(this) },
        { method: this.preCheck.bind(this) },
      ];
    }
    return [
      { method: host ? this.parseHost.bind(this) : this.parsePath.bind(this), assign: preKey },
      { method: this.preCheck.bind(this) },
    ];
  }

  private deploymentRoutes(auth = true) {
    return [{
      method: 'GET',
      path: '/deployment-favicon',
      handler: (_request: Hapi.Request, reply: Hapi.IReply) => {
        reply.file('favicon.ico');
      },
      config: {
        auth: false,
      },
    }, {
      method: 'GET',
      path: '/raw-deployment-handler/{param*}',
      handler: this.directoryHandler('key'),
      config: {
        auth: 'customAuthorize',
        pre: this.pre(auth, true, 'key'),
      },
    },
    {
      method: 'GET',
      path: '/deployments/{shortId}-{projectId}-{deploymentId}/{path*}',
      handler: this.directoryHandler('key'),
      config: {
        pre: this.pre(auth, false, 'key'),
        cors: true,
        auth: 'customAuthorize',
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    }].map((route: any) => {
      if (!auth) {
        route.config = { ...(route.config || {}), auth: false };
      }
      return route;
    });
  }

  public registerPrivate: HapiRegister = (server, _options, next) => {

    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.deploymentRoutes(false));

    next();
  }

  private async getGitlabYmlRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { projectId, ref, sha } = request.params as any;
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

  public serveDirectory(request: Hapi.Request) {
    const pre = request.pre as any;
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

  private parsePath(request: Hapi.Request, reply: Hapi.IReply) {
    const {shortId, projectId, deploymentId} = request.params;
    return reply({
      shortId,
      projectId: Number(projectId),
      deploymentId: Number(deploymentId),
    });
  }

  private async authorize(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const { projectId } = request.pre.key;
      if (await request.userHasAccessToProject(projectId)) {
        return reply('ok');
      }
    } catch (exception) {
      // Nothing to do here
    }
    return reply(Boom.unauthorized());
  }

  // internal method
  public async checkHash(deploymentId: number, shortId: string): Promise<boolean> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      return false;
    }
    return shortId === deployment.commit.shortId;
  }

  public async preCheck(request: Hapi.Request, reply: Hapi.IReply) {
    const { shortId, projectId, deploymentId } = request.pre.key;
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
    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);
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
