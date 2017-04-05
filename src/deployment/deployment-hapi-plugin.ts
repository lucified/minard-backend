
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as path from 'path';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';

import DeploymentModule, {
  deploymentVhost,
  getDeploymentKeyFromHost,
  isRawDeploymentHostname,
} from './deployment-module';

import { Logger, loggerInjectSymbol } from '../shared/logger';
import memoizee = require('memoizee');
import { minardUiBaseUrlInjectSymbol } from '../server/types';

const PREKEY = 'key';

@injectable()
class DeploymentHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  constructor(
    @inject(DeploymentModule.injectSymbol) private readonly deploymentModule: DeploymentModule,
    @inject(minardUiBaseUrlInjectSymbol) private readonly uiBaseUrl: string,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    private readonly isPrivate = false,
  ) {
    super({
      name: `deployment-plugin${isPrivate ? '-private' : ''}`,
      version: '1.0.0',
    });
    this.checkHash = memoizee(this.checkHash, {
      promise: true,
      normalizer: (args: any) => `${args[0]}-${args[1]}`,
    });
  }

  public register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {
    if (this.isPrivate) {
      server.route({
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
      });
    } else {
      server.ext('onPreResponse', this.onPreResponse.bind(this));
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
    }
    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.rawDeploymentRoutes(!this.isPrivate));
    next();
  }

  private rawDeploymentRoutes(auth: boolean) {
    return [{
      method: 'GET',
      path: '/favicon.ico',
      handler: (_request: Hapi.Request, reply: Hapi.IReply) => {
        reply.file('favicon.ico');
      },
      vhost: deploymentVhost,
      config: {
        auth: false,
      },
    }, {
      method: 'GET',
      path: '/{param*}',
      handler: this.directoryHandler(PREKEY),
      vhost: deploymentVhost,
      config: {
        auth: 'customAuthorize-cookie',
        pre: this.pre(auth, true, PREKEY),
      },
    }].map((route: any) => {
      if (!auth) {
        route.config = { ...(route.config || {}), auth: false };
      }
      return route;
    });
  }

  private onRequest(request: Hapi.Request, reply: Hapi.IReply) {
    // hostname doesn't include the port, host does
    const { hostname } = request.info;
    if (isRawDeploymentHostname(hostname)) {
      // Store the original hostname
      request.app.hostname = hostname;
      // Overwrite the hostname to use virtual host routing
      request.info.hostname = deploymentVhost;
    }
    return reply.continue();
  }

  private onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
    if (request.info.hostname === deploymentVhost && !request.auth.isAuthenticated) {
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

  private distPath(projectId: number, deploymentId: number) {
    return path.join(this.deploymentModule.getDeploymentPath(projectId, deploymentId));
  }

  private parseHost(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKeyFromHost(request.app.hostname);

    if (!key) {
      return reply(Boom.create(
        403,
        `Could not parse deployment URL from hostname '${request.app.hostname}'`,
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

  private async getGitlabYmlRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { projectId, ref, sha } = request.params;
    return reply(this.deploymentModule.getGitlabYml(Number(projectId), ref, sha))
      .header('content-type', 'text/plain');
  }

  private async getTraceRequestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { projectId, deploymentId } = request.params;
    const text = await this.deploymentModule.getBuildTrace(Number(projectId), Number(deploymentId));
    return reply(text)
      .header('content-type', 'text/plain');
  }

}

export default DeploymentHapiPlugin;

@injectable()
export class PrivateDeploymentHapiPlugin extends DeploymentHapiPlugin {
  public static injectSymbol = Symbol('private-deployment-hapi-plugin');
  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(minardUiBaseUrlInjectSymbol) uiBaseUrl: string,
    @inject(loggerInjectSymbol) logger: Logger,
  ) {
    super(deploymentModule, uiBaseUrl, logger, true);
  }
}

// From http://stackoverflow.com/questions/31840286/how-to-get-the-full-url-for-a-request-in-hapi
export function getEncodedUri(request: Hapi.Request) {
  const protocol = request.headers['x-forwarded-proto'] || request.connection.info.protocol;
  return fixedEncodeURIComponent(`${protocol}://${request.info.host}${request.url.path}`);
}

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function fixedEncodeURIComponent(uri: string) {
  return encodeURIComponent(uri).replace(/[!'()*.-]/g, c => '%' + c.charCodeAt(0).toString(16));
}
