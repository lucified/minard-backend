
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';

import JsonApiModule from './json-api-module';

@injectable()
export default class JsonApiHapiPlugin {

  public static injectSymbol = Symbol('json-api-hapi-plugin');

  private jsonApiModule: JsonApiModule;

  constructor(
    @inject(JsonApiModule.injectSymbol) jsonApiModule: JsonApiModule) {
    this.jsonApiModule = jsonApiModule;
    this.register.attributes = {
      name: 'json-api-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {

    server.route({
      method: 'GET',
      path: '/project/{projectId}/deployments',
      handler: {
        async: this.getProjectDeploymentsHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/project/{projectId}/deployments/{deploymentId}',
      handler: {
        async: this.getDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/project/{projectId}',
      handler: {
        async: this.getProjectHandler.bind(this),
      },
    });

    next();
  };

  private async getProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const projectId = (<any> request.params).projectId;
    return reply(this.jsonApiModule.getProject(projectId));
  }

  private async getProjectDeploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const projectId = (<any> request.params).projectId;
    return reply(this.jsonApiModule.getProjectDeployments(projectId));
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const projectId = (<any> request.params).projectId;
    const deploymentId = (<any> request.params).deploymentId;
    return reply(this.jsonApiModule.getDeployment(projectId, deploymentId));
  }

}
