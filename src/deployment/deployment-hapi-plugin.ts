
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as memoizee from 'memoizee';
import * as path from 'path';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { minardUiBaseUrlInjectSymbol } from '../server/types';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import DeploymentModule, {
  authorizedDeploymentVhost,
  getDeploymentKeyFromHost,
  openDeploymentVhost,
} from './deployment-module';

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
    server.ext('onRequest', this.onRequest.bind(this));

    if (this.isPrivate) {
      server.route(this.gitlabYmlRoute());
      server.route(this.rawDeploymentRoutes(false));
    } else {
      server.route(this.traceRoute());
      server.route(this.rawDeploymentRoutes(false));
      server.route(this.rawDeploymentRoutes(true));
      server.ext('onPreResponse', this.onPreResponse.bind(this));
    }
    next();
  }

  private async onRequest(request: Hapi.Request, reply: Hapi.IReply) {
    // hostname doesn't include the port, host does
    const { hostname } = request.info;
    const key = getDeploymentKeyFromHost(hostname);
    if (key !== null) {
      // Store the original hostname
      request.app.hostname = hostname;
      // Overwrite the hostname to use virtual host routing
      // Each vhost (including the default one) has a separate routing table
      if (this.isPrivate || await request.isOpenDeployment(key.projectId, key.deploymentId)) {
        request.info.hostname = openDeploymentVhost;
      } else {
        request.info.hostname = authorizedDeploymentVhost;
      }
    }
    return reply.continue();
  }

  private onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
    if (request.info.hostname === authorizedDeploymentVhost && !request.auth.isAuthenticated) {
      return reply.redirect(`${this.uiBaseUrl}/login/${getEncodedUri(request)}`);
    }
    return reply.continue();
  }

  private gitlabYmlRoute(): Hapi.IRouteConfiguration {
    return {
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
    };
  }

  private traceRoute(): Hapi.IRouteConfiguration {
    return {
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
    };
  }

  private rawDeploymentRoutes(needsAuthorization: boolean): Hapi.IRouteConfiguration[] {
    const vhost = needsAuthorization ? authorizedDeploymentVhost : openDeploymentVhost;
    return [{
      method: 'GET',
      path: '/{param*}', // A catch-all route
      handler: this.directoryHandler(),
      vhost,
      config: {
        auth: needsAuthorization && 'customAuthorize-cookie',
        pre: this.getPreMethods(needsAuthorization),
      },
    }, {
      method: 'GET',
      path: '/favicon.ico',
      handler: (_request: Hapi.Request, reply: Hapi.IReply) => {
        reply.file('favicon.ico');
      },
      vhost,
      config: {
        auth: false,
      },
    }];
  }

  private getPreMethods(needsAuthorization: boolean) {
    const preMethods: object[] = [{
      method: this.parseHostPre.bind(this),
      assign: PREKEY,
    }];
    if (needsAuthorization) {
      preMethods.push({ method: this.authorizePre.bind(this) });
    }
    preMethods.push({ method: this.checkDeploymentPre.bind(this) });
    return preMethods;
  }

  private parseHostPre(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKeyFromHost(request.app.hostname);

    if (!key) {
      return reply(Boom.create(
        403,
        `Could not parse deployment URL from hostname '${request.app.hostname}'`,
      ));
    }
    return reply(key);

  }

  private async authorizePre(request: Hapi.Request, reply: Hapi.IReply) {
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

  public async checkDeploymentPre(request: Hapi.Request, reply: Hapi.IReply) {
    const { shortId, projectId, deploymentId } = request.pre[PREKEY];
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

  // internal method
  public async checkHash(deploymentId: number, shortId: string): Promise<boolean> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      return false;
    }
    return shortId === deployment.commit.shortId;
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

  private directoryHandler() {
    return {
      directory: {
        path: (request: Hapi.Request) => {
          const { projectId, deploymentId } = request.pre[PREKEY];
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
