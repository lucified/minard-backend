
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';

import { inject, injectable } from 'inversify';

import StatusModule from './status-module';

@injectable()
class StatusHapiPlugin {

  public static injectSymbol = Symbol('status-hapi-plugin');
  private statusModule: StatusModule;

  constructor(@inject(StatusModule.injectSymbol) statusModule: StatusModule) {
    this.statusModule = statusModule;
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
    next();
  };

  private async getStatusHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const ecsKey = 'ecs';
    const withEcs = request.params[ecsKey] === 'ecs';
    const state = await this.statusModule.getStatus(withEcs);
    const systemStatus = Object.keys(state).map(key => state[key]).every(status => status.active);
    return reply(state)
      .code(systemStatus ? 200 : 503);
  }

}

export default StatusHapiPlugin;
