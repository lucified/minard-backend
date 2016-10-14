
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';

import { inject, injectable } from 'inversify';

import * as logger from '../shared/logger';
import { default as StatusModule, getEcsStatus } from './status-module';

@injectable()
class StatusHapiPlugin {

  public static injectSymbol = Symbol('status-hapi-plugin');
  private statusModule: StatusModule;
  private readonly logger: logger.Logger;

  constructor(
    @inject(StatusModule.injectSymbol) statusModule: StatusModule,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger
  ) {
    this.statusModule = statusModule;
    this.logger = logger;
    this.register.attributes = {
      name: 'status-hapi-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'GET',
      path: '/status/{ecs?}',
      handler: {
        async: this.getStatusHandler,
      },
      config: {
        bind: this,
      },
    });
    server.route({
      method: 'GET',
      path: '/error/{logger?}',
      handler: {
        async: this.getErrorHandler,
      },
      config: {
        bind: this,
      },
    });
    next();
  };

  public getEcsStatus() {
    return getEcsStatus();
  }

  private async getStatusHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const ecsKey = 'ecs';
    const withEcs = request.params[ecsKey] === 'ecs';
    const state = await this.statusModule.getStatus(withEcs);
    const systemStatus = Object.keys(state).map(key => state[key]).every(status => status.active);
    return reply(state)
      .code(systemStatus ? 200 : 503);
  }

  // This is intentionally async
  private async getErrorHandler(request: Hapi.Request, reply: Hapi.IReply) {

    const error = new Error('An intentional error');
    if (request.paramsArray[0]) {
      this.logger.error('/error', error);
    } else {
      throw error;
    }

    return reply('ERROR')
      .code(503);
  }

}

export default StatusHapiPlugin;
