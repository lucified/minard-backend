
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import { IReply, IServerOptions, Request, Server } from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';

import DeploymentModule from './deployment-module';

@injectable()
class CiHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('ci-hapi-plugin');

  constructor(
    @inject(DeploymentModule.injectSymbol) private readonly deploymentModule: DeploymentModule,
  ) {

    super({
      name: 'ci-plugin',
      version: '1.0.0',
    });

  }

  public register(server: Server, _options: IServerOptions, next: () => void) {

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
  private async getGitlabYmlRequestHandler(request: Request, reply: IReply) {
    const { projectId, ref, sha } = request.params;
    return reply(this.deploymentModule.getGitlabYml(Number(projectId), ref, sha))
      .header('content-type', 'text/plain');
  }

  private async getTraceRequestHandler(request: Request, reply: IReply) {
    const { projectId, deploymentId } = request.params;
    const text = await this.deploymentModule.getBuildTrace(Number(projectId), Number(deploymentId));
    return reply(text)
      .header('content-type', 'text/plain');
  }

}

export default CiHapiPlugin;
