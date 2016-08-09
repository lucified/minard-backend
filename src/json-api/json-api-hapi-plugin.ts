
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import { HapiRegister } from '../server/hapi-register';
import JsonApiModule from './json-api-module';

function onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
  const response = request.response;

  if (!request.path.startsWith('/api')) {
    return reply.continue();
  }

  if (request.method === 'options') {
    return reply.continue();
  }

  const contentType = 'application/vnd.api+json; charset=utf-8';
  if (response.isBoom) {
    const output = (<any> response).output;
    const error = {
      title: output.payload.error,
      status: output.statusCode,
      detail: output.payload.message,
    };
    output.payload = {
      errors: [error],
    };
    output.headers['content-type'] = contentType;
  } else {
    if (response.source) {
      response.source.meta = { id: request.id };
    }
    response.headers['content-type'] = contentType;
  }
  return reply.continue();
};

export function parseActivityFilter(filter: string | null) {
  const ret = {
    projectId: null as number | null,
  };
  if (!filter) {
    return ret;
  }
  const projectMatches = filter.match(/project(\d+)/);
  if (projectMatches !== null && projectMatches.length === 2) {
    ret.projectId = Number(projectMatches[1]);
  }
  return ret;
}

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

    server.ext('onPreResponse', onPreResponse);

    server.route({
      method: 'GET',
      path: '/deployments/{projectId}-{deploymentId}',
      handler: {
        async: this.getDeploymentHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/projects/{projectId}',
      handler: {
        async: this.getProjectHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/teams/{teamId}/projects',
      handler: {
        async: this.getProjectsHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            teamId: Joi.string().required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/branches/{projectId}-{branchName}',
      handler: {
        async: this.getBranchHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            branchName: Joi.string().alphanum().min(1).required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/commits/{projectId}-{hash}',
      handler: {
        async: this.getCommitHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            hash: Joi.string().alphanum().min(8).required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/activity',
      handler: {
        async: this.getActivityHandler.bind(this),
      },
    });

    next();
  };

  private async getProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    return reply(this.jsonApiModule.getProject(projectId));
  }

  private async getProjectsHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: parse team information
    return reply(this.jsonApiModule.getProjects(1));
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const deploymentId = Number((<any> request.params).deploymentId);
    return reply(this.jsonApiModule.getDeployment(projectId, deploymentId));
  }

  private async getBranchHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const branchName = (<any> request.params).branchName as string;
    return reply(this.jsonApiModule.getBranch(projectId, branchName));
  }

  private async getCommitHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const hash = (<any> request.params).hash as string;
    return reply(this.jsonApiModule.getCommit(projectId, hash));
  }

  private async getActivityHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const filter = request.query.filter as string;
    const filterOptions = parseActivityFilter(filter);
    if (filterOptions.projectId) {
      return reply(this.jsonApiModule.getProjectActivity(filterOptions.projectId));
    }
    // for now any team id returns all activity
    return reply(this.jsonApiModule.getTeamActivity(1));
  }

}
