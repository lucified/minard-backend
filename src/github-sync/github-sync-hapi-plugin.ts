import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import GitHubSyncModule from './github-sync-module';

@injectable()
export default class GitHubSyncPlugin {
  public static injectSymbol = Symbol('github-sync-plugin');

  constructor(
    @inject(GitHubSyncModule.injectSymbol)
    private readonly githubSyncModule: GitHubSyncModule,
  ) {
    this.register.attributes = {
      name: 'github-sync-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'POST',
      path: '/webhook/{projectId}/{token}',
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            token: Joi.string().required(),
          },
        },
        auth: false,
      },
      handler: {
        async: async (request: Hapi.Request, reply: Hapi.ReplyNoContinue) => {
          const { projectId, token } = request.params;
          await this.githubSyncModule.receiveGitHubHook(
            parseInt(projectId, 10),
            token,
            request.payload,
          );
          return reply('ok');
        },
      },
    });
    next();
  };
}
