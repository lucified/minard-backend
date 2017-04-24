
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
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
  ) {
    this.statusModule = statusModule;
    this.logger = logger;
    this.register.attributes = {
      name: 'status-hapi-plugin',
      version: '1.0.0',
    };
    this.registerPrivate.attributes = {
      name: 'status-hapi-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route(this.getRoutes());
    next();
  }
  public registerPrivate: HapiRegister = (server, _options, next) => {
    server.route(this.getRoutes(false));
    next();
  }

  private getRoutes(auth = true) {
    return [{
      method: 'GET',
      path: '/status/{ecs?}',
      handler: {
        async: this.getStatusHandler,
      },
      config: {
        bind: this,
        auth: false,
      },
    }, {
      method: 'GET',
      path: '/health',
      handler: {
        async: this.getHealthHandler,
      },
      config: {
        bind: this,
        auth: false,
      },
    }, {
      method: 'GET',
      path: '/error/{logger?}',
      handler: {
        async: this.getErrorHandler,
      },
      config: {
        bind: this,
        auth: 'admin',
      },
    }].map((route: any) => {
      if (!auth) {
        route.config = { ...(route.config || {}), auth: false };
      }
      return route;
    });
  }

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

  private async getHealthHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    return reply('OK').code(200);
  }

  // This is intentionally async
  private async getErrorHandler(request: Hapi.Request, reply: Hapi.IReply) {

    if (request.paramsArray[0] === 'winston') {
      this.logger.error('winston error', new Error('An intentional winston error'));
    } else {
      throw new Error('An intentional hapi error');
    }

    return reply('ERROR')
      .code(503);
  }

}

export default StatusHapiPlugin;
