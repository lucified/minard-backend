
import * as Boom from 'boom';
import * as Hapi from 'hapi';
import { inject, injectable, interfaces } from 'inversify';
import * as Joi from 'joi';

import { HapiRegister } from '../server/hapi-register';
import { JsonApiModule } from './json-api-module';
import { serializeApiEntity }  from './serialization';
import { ApiEntities, ApiEntity } from './types';

import { externalBaseUrlInjectSymbol } from '../server/types';

function onPreResponse(request: Hapi.Request, reply: Hapi.IReply) {
  const response = request.response;

  if (!request.path.startsWith('/api')) {
    return reply.continue();
  }

  if (request.method === 'options') {
    return reply.continue();
  }

  function applyHeaders(obj: any) {
    const contentType = 'application/vnd.api+json; charset=utf-8';
    obj.headers['content-type'] = contentType;
    obj.headers['Access-Control-Allow-Origin'] = '*';
  }

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
    applyHeaders(output);
  } else {
    applyHeaders(response);
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
  const projectMatches = filter.match(/^project\[(\d+)\]$/);
  if (projectMatches !== null && projectMatches.length === 2) {
    ret.projectId = Number(projectMatches[1]);
  }
  return ret;
}

type apiReturn = Promise<ApiEntity | ApiEntities | null>;

const projectNameRegex = /^[\w|\-]+$/;

@injectable()
export class JsonApiHapiPlugin {

  public static injectSymbol = Symbol('json-api-hapi-plugin');

  private baseUrl: string;
  private factory: () => JsonApiModule;

  constructor(
    @inject(JsonApiModule.factoryInjectSymbol) factory: interfaces.Factory<JsonApiModule>,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string) {
    this.factory = factory as () => JsonApiModule;
    this.register.attributes = {
      name: 'json-api-plugin',
      version: '1.0.0',
    };
    this.baseUrl = baseUrl + '/api';
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
      method: 'POST',
      path: '/projects',
      handler: {
        async: this.postProjectHandler.bind(this),
      },
      config: {
        cors: true,
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('projects').required(),
              attributes: Joi.object({
                name: Joi.string().regex(projectNameRegex).required(),
                description: Joi.string().max(2000),
              }).required(),
              relationships: Joi.object({
                team: Joi.object({
                  data: Joi.object({
                    type: Joi.string().equal('teams').required(),
                    id: Joi.number().required(),
                  }).required(),
                }).required(),
              }).required(),
            }).required(),
          },
        },
      },
    });

    server.route({
      method: 'DELETE',
      path: '/projects/{projectId}',
      handler: {
        async: this.deleteProjectHandler.bind(this),
      },
      config: {
        cors: true,
        validate: {
          params: {
            projectId: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'PATCH',
      path: '/projects/{projectId}',
      handler: {
        async: this.patchProjectHandler.bind(this),
      },
      config: {
        cors: true,
        validate: {
          params: {
            projectId: Joi.number().required(),
          },
          payload: {
            data: Joi.object({
              id: Joi.number(),
              type: Joi.string().equal('projects').required(),
              attributes: Joi.object({
                name: Joi.string().regex(projectNameRegex),
                description: Joi.string().max(2000),
              }).required(),
            }).required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/projects/{projectId}/relationships/branches',
      handler: {
        async: this.getProjectBranchesHandler.bind(this),
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
      path: '/teams/{teamId}/relationships/projects',
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
      path: '/branches/{projectId}-{branchName}/relationships/commits',
      handler: {
        async: this.getBranchCommitsHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            branchName: Joi.string().alphanum().min(1).required(),
          },
          query: {
            until: Joi.date(),
            count: Joi.number(),
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

  private serializeApiEntity(type: string, entity: any) {
    return serializeApiEntity(type, entity, this.baseUrl);
  }

  private async getEntity(type: string, entityFetcher: (api: JsonApiModule) => apiReturn) {
    const entity = await entityFetcher(this.factory());
    if (!entity) {
      throw Boom.notFound(`${type} not found`);
    }
    return this.serializeApiEntity(type, entity);
  }

  private async getProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    return reply(this.getEntity('project', api => api.getProject(projectId)));
  }

  private async getProjectBranchesHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    return reply(this.getEntity('branch', api => api.getProjectBranches(projectId)));
  }

  private async getProjectsHandler(_request: Hapi.Request, reply: Hapi.IReply) {
    // TODO: parse team information
    return reply(this.getEntity('project', api => api.getProjects(1)));
  }

  private async postProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, description } = request.payload.data.attributes;
    const teamId = request.payload.data.relationships.team.data.id;
    const project = await this.factory().createProject(teamId, name, description);
    return reply(this.serializeApiEntity('project', project))
      .created(`/api/projects/${project.id}`);
  }

  private async patchProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const attributes = request.payload.data.attributes;
    const projectId = (<any> request.params).projectId;
    if (!attributes.name && !attributes.description) {
      // Require that at least something is edited
      throw Boom.badRequest();
    }
    const project = await this.factory().editProject(projectId, attributes);
    return reply(this.serializeApiEntity('project', project));
  }

  private async deleteProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    await this.factory().deleteProject(projectId);
    return reply({});
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const deploymentId = Number((<any> request.params).deploymentId);
    return reply(this.getEntity('deployment', api => api.getDeployment(projectId, deploymentId)));
  }

  private async getBranchHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const branchName = (<any> request.params).branchName as string;
    return reply(this.getEntity('branch', api => api.getBranch(projectId, branchName)));
  }

  private async getBranchCommitsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const branchName = String((<any> request.params).branchName);
    const until = String(request.query.until);
    const count = Number(request.query.count);
    return reply(this.getEntity('commit', api => api.getBranchCommits(projectId, branchName, until, count)));
  }

  private async getCommitHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const hash = (<any> request.params).hash as string;
    return reply(this.getEntity('commit', api => api.getCommit(projectId, hash)));
  }

  private async getActivityHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const filter = request.query.filter as string;
    const filterOptions = parseActivityFilter(filter);
    const projectId = filterOptions.projectId;
    if (projectId !== null) {
      return reply(this.getEntity('activity', api => api.getProjectActivity(projectId)));
    }
    if (filter && !filterOptions.projectId) {
      // if filter is specified it should be valid
      throw Boom.badRequest('Invalid filter');
    }
    // for now any team id returns all activity
    return reply(this.getEntity('activity', api => api.getTeamActivity(1)));
  }

}
