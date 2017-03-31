
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

import { Logger, loggerInjectSymbol } from '../shared/logger';
import memoizee = require('memoizee');
import { minardUiBaseUrlInjectSymbol } from '../server/types';

const PREKEY = 'key';

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  constructor(
    @inject(DeploymentModule.injectSymbol) private readonly deploymentModule: DeploymentModule,
    @inject(minardUiBaseUrlInjectSymbol) private readonly uiBaseUrl: string,
    @inject(loggerInjectSymbol) private readonly logger: Logger) {

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
    server.ext('onPreResponse', this.onPreResponse.bind(this));
    server.route(this.deploymentRoutes(true));

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

  public registerPrivate: HapiRegister = (server, _options, next) => {

    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.deploymentRoutes(false));

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

  private onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
    if (isRawDeploymentHostname(request.info.hostname) && !request.auth.isAuthenticated) {
      return reply.redirect(`${this.uiBaseUrl}/login/${getEncodedUri(request)}`);
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

  private deploymentRoutes(auth: boolean) {
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
      handler: this.directoryHandler(PREKEY),
      config: {
        auth: 'customAuthorize',
        pre: this.pre(auth, true, PREKEY),
      },
    },
    {
      method: 'GET',
      path: '/deployments/{shortId}-{projectId}-{deploymentId}/{path*}',
      handler: this.directoryHandler(PREKEY),
      config: {
        pre: this.pre(false, false, PREKEY), // Is authorized on a higher level
        cors: true,
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
    const { shortId, projectId, deploymentId } = request.params;
    return reply({
      shortId,
      projectId: Number(projectId),
      deploymentId: Number(deploymentId),
    });
  }

  // internal method
  public async checkHash(deploymentId: number, shortId: string): Promise<boolean> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      return false;
    }
    return shortId === deployment.commit.shortId;
  }

  private async authorize(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const { projectId } = request.pre[PREKEY];
      if (await request.userHasAccessToProject(projectId)) {
        return reply('ok');
      }
    } catch (exception) {
      // Nothing to do here
    }
    return reply(Boom.unauthorized());
  }

  private pre(auth: boolean, host: boolean, preKey: string) {
    const preMethods: object[] = [
      {
        method: host ? this.parseHost.bind(this) : this.parsePath.bind(this),
        assign: preKey,
      },
    ];
    if (auth) {
      preMethods.push({ method: this.authorize.bind(this) });
    }
    preMethods.push({ method: this.preCheck.bind(this) });
    return preMethods;
  }

  public async preCheck(request: Hapi.Request, reply: Hapi.IReply) {
    const { shortId, projectId, deploymentId } = request.pre[PREKEY];
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

// From http://stackoverflow.com/questions/31840286/how-to-get-the-full-url-for-a-request-in-hapi
export function getEncodedUri(request: Hapi.Request) {
  const protocol = request.headers['x-forwarded-proto'] || request.connection.info.protocol;
  return fixedEncodeURIComponent(`${protocol}://${request.info.host}${request.url.path}`);
}

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function fixedEncodeURIComponent(uri: string) {
  return encodeURIComponent(uri).replace(/[!'()*.-]/g, c => '%' + c.charCodeAt(0).toString(16));
}
