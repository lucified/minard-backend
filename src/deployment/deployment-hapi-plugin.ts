
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as path from 'path';

import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';

import DeploymentModule, {
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
    if (!this.isPrivate) {
      server.ext('onPreResponse', this.onPreResponse.bind(this));
    }
    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.deploymentRoutes(!this.isPrivate));
    next();
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
      path: '/{param*}',
      handler: this.directoryHandler(PREKEY),
      config: {
        auth: 'customAuthorize',
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
        const parts = hostname.split('.');
        // Drop the wildcard part to route with static vhost
        request.info.hostname = parts.slice(1).join('.');
    }
    return reply.continue();
  }


  private onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
    if (!request.auth.isAuthenticated) {
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
