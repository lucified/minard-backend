import { inject, injectable } from 'inversify';

import { STRATEGY_ROUTELEVEL_ADMIN_HEADER } from '../authentication';
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
    const config = {
      auth: STRATEGY_ROUTELEVEL_ADMIN_HEADER,
      bind: this,
    };
    server.route({
      method: 'GET',
      path: '/check-screenshots',
      handler: {
        async: this.checkScreenshotsHandler,
      },
      config,
    });
    server.route({
      method: 'GET',
      path: '/check-deployment-activity',
      handler: {
        async: this.checkDeploymentActivityHandler,
      },
      config,
    });
    server.route({
      method: 'GET',
      path: '/cleanup-running-deployments',
      handler: {
        async: this.cleanupRunningDeployments,
      },
      config,
    });
    next();
  }

  public async checkScreenshotsHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.assureScreenshotsGenerated();
    return reply({
      status: 200,
      message: 'ok',
    });
  }

  public async checkDeploymentActivityHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.assureDeploymentActivity();
    return reply({
      status: 200,
      message: 'ok',
    });
  }

  public async cleanupRunningDeployments(_request: Hapi.Request, reply: Hapi.IReply) {
    this.operationsModule.cleanupRunningDeployments();
    return reply({
      status: 200,
      message: 'cleanup started',
    });
  }

}
