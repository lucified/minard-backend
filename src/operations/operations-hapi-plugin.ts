
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import OperationsModule from './operations-module';

@injectable()
export default class OperationsHapiPlugin {

  public static injectSymbol = Symbol('operations-hapi-plugin');

  private operationsModule: OperationsModule;

  constructor(
    @inject(OperationsModule.injectSymbol) operationsModule: OperationsModule) {
    this.operationsModule = operationsModule;
    this.register.attributes = {
      name: 'operations-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'GET',
      path: '/check-screenshots',
      handler: {
        async: this.checkScreenshotsHandler.bind(this),
      },
    });
    server.route({
      method: 'GET',
      path: '/check-deployment-activity',
      handler: {
        async: this.checkDeploymentActivityHandler.bind(this),
      },
    });
    next();
  };

  public async checkScreenshotsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.assureScreenshotsGenerated();
    return reply({
      status: 200,
      message: 'ok',
    });
  }

  public async checkDeploymentActivityHandler(request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.assureDeploymentActivity();
    return reply({
      status: 200,
      message: 'ok',
    });
  }

}
