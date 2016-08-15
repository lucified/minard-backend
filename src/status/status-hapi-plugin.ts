
import { HapiRegister } from '../server/hapi-register';
import * as Hapi from 'hapi';
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
      path: '/status',
      handler: {
        async: this.getStatusHandler.bind(this),
      },
    });
    next();
  };

  private async getStatusHandler(request: Hapi.Request, reply: Hapi.IReply) {
    return reply(this.statusModule.getStatus());
  }

}

export default StatusHapiPlugin;
