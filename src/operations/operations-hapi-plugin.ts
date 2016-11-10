
import { inject, injectable } from 'inversify';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import OperationsModule from './operations-module';

@injectable()
export default class OperationsHapiPlugin {

  public static injectSymbol = Symbol('operations-hapi-plugin');

  public operationsModule: OperationsModule;

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
        async: this.checkScreenshotsHandler,
      },
      config: {
        bind: this,
      },
    });
    server.route({
      method: 'GET',
      path: '/check-deployment-activity',
      handler: {
        async: this.checkDeploymentActivityHandler,
      },
      config: {
        bind: this,
      },
    });
    server.route({
      method: 'GET',
      path: '/cleanup-running-deployments',
      handler: {
        async: this.cleanupRunningDeployments,
      },
      config: {
        bind: this,
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

  public async cleanupRunningDeployments(request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.cleanupRunningDeployments();
    return reply({
      status: 200,
      message: 'cleanup started',
    });
  }

}
