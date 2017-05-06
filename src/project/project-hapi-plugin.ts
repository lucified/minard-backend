import { inject, injectable } from 'inversify';

import { STRATEGY_INTERNAL_REQUEST } from '../authentication';
import { HapiRegister } from '../server/hapi-register';
import ProjectModule from './project-module';

@injectable()
export default class ProjectHapiPlugin {

  public static injectSymbol = Symbol('project-hapi-plugin');

  private projectModule: ProjectModule;

  constructor(@inject(ProjectModule.injectSymbol) projectModule: ProjectModule) {
    this.projectModule = projectModule;
    this.register.attributes = {
      name: 'project-plugin',
      version: '1.0.0',
    };
  }

  public registerHooks() {
    return Promise.all([
      this.projectModule.assureSystemHookRegistered(),
      this.projectModule.assureProjectHooksRegistered(),
    ]);
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'POST',
      path: '/project/hook',
      config: {
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
      },
      handler: (request: any, reply: any) => {
        this.projectModule.receiveHook(request.payload);
        return reply('ok');
      },
    });

    server.route({
      method: 'POST',
      path: '/project/project-hook',
      config: {
        auth: {
          strategies: [STRATEGY_INTERNAL_REQUEST],
        },
      },
      handler: (request: any, reply: any) => {
        this.projectModule.receiveProjectHook(request.payload);
        return reply('ok');
      },
    });

    next();
  }
}
