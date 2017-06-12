import { badImplementation, create, notFound, unauthorized } from 'boom';
import 'inert';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as memoizee from 'memoizee';
import { join } from 'path';

import {
  STRATEGY_INTERNAL_REQUEST,
  STRATEGY_ROUTELEVEL_USER_COOKIE,
} from '../authentication';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { minardUiBaseUrlInjectSymbol } from '../server/types';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import DeploymentModule, {
  deploymentVhost,
  getDeploymentKeyFromHost,
} from './deployment-module';

const PREKEY = 'key';
interface Pre {
  key: {
    projectId: number;
    deploymentId: number;
    shortId: string;
  };
}

@injectable()
class DeploymentHapiPlugin extends HapiPlugin {
  public static injectSymbol = Symbol('deployment-hapi-plugin');

  constructor(
    @inject(
      DeploymentModule.injectSymbol,
    ) protected readonly deploymentModule: DeploymentModule,
    @inject(minardUiBaseUrlInjectSymbol) private readonly uiBaseUrl: string,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {
    super({
      name: `deployment-plugin`,
      version: '1.0.0',
    });
    this.checkHash = memoizee(this.checkHash, {
      promise: true,
      normalizer: (args: any) => `${args[0]}-${args[1]}`,
    });
    this.parseHostPre = this.parseHostPre.bind(this);
    this.authorizePre = this.authorizePre.bind(this);
    this.checkDeploymentPre = this.checkDeploymentPre.bind(this);
  }

  public register(
    server: Hapi.Server,
    _options: Hapi.ServerOptions,
    next: () => void,
  ) {
    server.ext('onRequest', this.onRequest.bind(this));
    server.route(this.traceRoute());
    server.route(this.rawDeploymentRoutes());
    server.route(this.gitlabYmlRoute());
    server.ext('onPreResponse', this.onPreResponse.bind(this));
    next();
  }

  protected async onRequest(
    request: Hapi.Request,
    reply: Hapi.ReplyWithContinue,
  ) {
    // hostname doesn't include the port, host does
    const { hostname } = request.info;
    const key = getDeploymentKeyFromHost(hostname);
    if (key !== null) {
      // Store the original hostname
      request.app.hostname = hostname;
      // Overwrite the hostname to use virtual host routing
      // Each vhost (including the default one) has a separate routing table
      request.info.hostname = deploymentVhost;
    }
    return reply.continue();
  }

  protected onPreResponse(
    request: Hapi.Request,
    reply: Hapi.ReplyWithContinue,
  ) {
    // Redirect to login page, if user didn't pass
    const output = (request.response as any).output;
    const hasForbiddenStatusCode =
      output && [401, 403].find(code => code === output.statusCode);
    if (
      request.info.hostname === deploymentVhost &&
      request.response &&
      request.response.isBoom &&
      hasForbiddenStatusCode &&
      !request.auth.isAuthenticated &&
      !request.isInternal
    ) {
      return reply.redirect(
        `${this.uiBaseUrl}/login/${getEncodedUri(request)}`,
      );
    }
    return reply.continue();
  }

  private traceRoute(): Hapi.RouteConfiguration {
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

  protected rawDeploymentRoutes(): Hapi.RouteConfiguration[] {
    return [
      {
        method: 'GET',
        path: '/{param*}', // A catch-all route
        handler: this.directoryHandler(),
        vhost: deploymentVhost,
        config: {
          auth: {
            mode: 'try',
            strategies: [STRATEGY_ROUTELEVEL_USER_COOKIE],
          },
          pre: [
            {
              method: this.parseHostPre,
              assign: PREKEY,
            },
            this.authorizePre,
            this.checkDeploymentPre,
          ],
        },
      },
      {
        method: 'GET',
        path: '/favicon.ico',
        handler: (_request: Hapi.Request, reply: Hapi.ReplyNoContinue) => {
          reply.file('favicon.ico');
        },
        vhost: deploymentVhost,
        config: {
          auth: false,
        },
      },
    ];
  }

  protected parseHostPre(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    const key = getDeploymentKeyFromHost(request.app.hostname);
    if (!key) {
      return reply(
        create(
          403,
          `Could not parse deployment URL from hostname '${request.app
            .hostname}'`,
        ),
      );
    }
    return reply(key);
  }

  protected async authorizePre(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const { projectId, deploymentId } = getPre(request);
      if (request.isInternal) {
        return reply('ok');
      }
      if (
        await request.userHasAccessToDeployment(
          projectId,
          deploymentId,
          request.auth.credentials,
        )
      ) {
        return reply('ok');
      }
    } catch (exception) {
      // Nothing to do here
    }
    return reply(unauthorized());
  }

  public async checkDeploymentPre(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const { shortId, projectId, deploymentId } = getPre(request);
    try {
      if (!await this.checkHash(deploymentId, shortId)) {
        this.logger.info(`checkHash failed for deployment`, {
          deploymentId,
          projectId,
          shortId,
        });
        return reply(notFound('Invalid commit hash or deployment not found'));
      }
    } catch (err) {
      this.logger.error('Unexpected error in precheck', err);
      return reply(badImplementation());
    }
    const isReady = this.deploymentModule.isDeploymentReadyToServe(
      projectId,
      deploymentId,
    );
    if (!isReady) {
      return reply(notFound(`Deployment is not ready for serving`));
    }
    return reply('ok');
  }

  // internal method
  public async checkHash(
    deploymentId: number,
    shortId: string,
  ): Promise<boolean> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      return false;
    }
    return shortId === deployment.commit.shortId;
  }

  private async getTraceRequestHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const { projectId, deploymentId } = request.params;
    const text = await this.deploymentModule.getBuildTrace(
      Number(projectId),
      Number(deploymentId),
    );
    return reply(text).header('content-type', 'text/plain');
  }

  private directoryHandler() {
    return {
      directory: {
        path: (request: Hapi.Request) => {
          const { projectId, deploymentId } = getPre(request);
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
    return join(
      this.deploymentModule.getDeploymentPath(projectId, deploymentId),
    );
  }

  private gitlabYmlRoute(): Hapi.RouteConfiguration {
    return {
      method: 'GET',
      path: '/ci/projects/{projectId}/{ref}/{sha}/yml',
      handler: {
        async: this.getGitlabYmlRequestHandler,
      },
      config: {
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
        bind: this,
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

  private async getGitlabYmlRequestHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const { projectId, ref, sha } = request.params;
    return reply(
      this.deploymentModule.getGitlabYml(Number(projectId), ref, sha),
    ).header('content-type', 'text/plain');
  }
}

export default DeploymentHapiPlugin;

// From http://stackoverflow.com/questions/31840286/how-to-get-the-full-url-for-a-request-in-hapi
export function getEncodedUri(request: Hapi.Request) {
  const protocol =
    request.headers['x-forwarded-proto'] || request.connection.info.protocol;
  return fixedEncodeURIComponent(
    `${protocol}://${request.info.host}${request.url.path}`,
  );
}

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function fixedEncodeURIComponent(uri: string) {
  return encodeURIComponent(uri).replace(
    /[!'()*.-]/g,
    c => '%' + c.charCodeAt(0).toString(16),
  );
}

function getPre(request: Hapi.Request) {
  const pre = request.pre as Pre;
  return pre.key;
}
