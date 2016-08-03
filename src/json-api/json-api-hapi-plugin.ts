
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';

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
      path: '/deployments/{deploymentId}',
      handler: {
        async: this.getDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/projects/{projectId}',
      handler: {
        async: this.getProjectHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/teams/{teamId}/projects',
      handler: {
        async: this.getProjectsHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/branches/{branchId}',
      handler: {
        async: this.getBranchHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/commits/{commitId}',
      handler: {
        async: this.getCommitHandler.bind(this),
      },
    });

    next();
  };

  private async getProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const projectId = (<any> request.params).projectId;
    return reply(this.jsonApiModule.getProject(projectId));
  }

  private async getProjectsHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: parse team information
    return reply(this.jsonApiModule.getProjects(1));
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const deploymentId = (<any> request.params).deploymentId as string;
    return reply(this.jsonApiModule.getDeployment(deploymentId));
  }

  private async getBranchHandler(request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: validation
    const branchId = (<any> request.params).branchId as string;
    return reply(this.jsonApiModule.getBranch(branchId));
  }

  private async getCommitHandler(_request: Hapi.Request, _reply: Hapi.IReply) {
    // const _branchId = (<any> request.params).branchId as string;
    throw new MinardError(MINARD_ERROR_CODE.NOT_IMPLEMENTED);
  }

}
