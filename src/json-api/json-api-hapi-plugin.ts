
import * as Boom from 'boom';
import { inject, injectable, interfaces } from 'inversify';
import * as Joi from 'joi';
import * as moment from 'moment';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import { externalBaseUrlInjectSymbol } from '../server/types';
import { parseApiBranchId } from './conversions';
import { JsonApiModule } from './json-api-module';
import { serializeApiEntity }  from './serialization';
import { ApiEntities, ApiEntity } from './types';

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
    teamId: null as number | null,
  };
  if (!filter) {
    return ret;
  }
  const projectMatches = filter.match(/^project\[(\d+)\]$/);
  if (projectMatches !== null && projectMatches.length === 2) {
    ret.projectId = Number(projectMatches[1]);
  }

  const teamIdMatches = filter.match(/^team\[(\d+)\]$/);
  if (teamIdMatches !== null && teamIdMatches.length === 2) {
    ret.teamId = Number(teamIdMatches[1]);
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
        async: this.getDeploymentHandler,
      },
      config: {
        bind: this,
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
        async: this.getProjectHandler,
      },
      config: {
        bind: this,
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
        async: this.postProjectHandler,
      },
      config: {
        bind: this,
        cors: true,
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('projects').required(),
              attributes: Joi.object({
                name: Joi.string().regex(projectNameRegex).required(),
                description: Joi.string().max(2000),
                templateProjectId: Joi.number(),
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
        async: this.deleteProjectHandler,
      },
      config: {
        bind: this,
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
        async: this.patchProjectHandler,
      },
      config: {
        cors: true,
        bind: this,
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
        async: this.getProjectBranchesHandler,
      },
      config: {
        bind: this,
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
        async: this.getProjectsHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/branches/{branchId}',
      handler: {
        async: this.getBranchHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            branchId: Joi.string().required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/branches/{branchId}/relationships/commits',
      handler: {
        async: this.getBranchCommitsHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            branchId: Joi.string().required(),
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
        async: this.getCommitHandler,
      },
      config: {
        bind: this,
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
        async: this.getActivityHandler,
      },
      config: {
        bind: this,
        validate: {
          query: {
            until: Joi.date(),
            count: Joi.number(),
            filter: Joi.string(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/projects/{projectId}/relationships/notification',
      handler: {
        async: this.getProjectNotificationConfigurationsHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            projectId: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'DELETE',
      path: '/notifications/{id}',
      handler: {
        async: this.deleteNotificationConfigurationHandler,
      },
      config: {
        bind: this,
        validate: {
          params: {
            id: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'POST',
      path: '/notifications',
      handler: {
        async: this.postNotificationConfigurationHandler,
      },
      config: {
        bind: this,
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('notifications').required(),
              attributes: Joi.alternatives(
                Joi.object({
                  type: Joi.string().equal('flowdock').required(),
                  projectId: Joi.number().required(),
                  flowToken: Joi.string().alphanum().required(),
                }),
                Joi.object({
                  type: Joi.string().equal('hipchat').required(),
                  projectId: Joi.number().required(),
                  hipchatRoomId: Joi.number().required(),
                  hipchatAuthToken: Joi.string().required(),
                })
              ),
            }).required(),
          },
        },
      },
    });

    next();
  };

  public serializeApiEntity(type: string, entity: any) {
    return serializeApiEntity(type, entity, this.baseUrl);
  }

  public async getEntity(type: string, entityFetcher: (api: JsonApiModule) => apiReturn) {
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

  private async getProjectsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const teamId = (<any> request.params).teamId;
    return reply(this.getEntity('project', api => api.getProjects(teamId)));
  }

  private async postProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, description, templateProjectId } = request.payload.data.attributes;
    const teamId = request.payload.data.relationships.team.data.id;
    const project = await this.factory().createProject(teamId, name, description, templateProjectId);
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
    const matches = parseApiBranchId((<any> request.params).branchId);
    if (!matches) {
      throw Boom.badRequest('Invalid branch id');
    }
    const { projectId, branchName } = matches;
    return reply(this.getEntity('branch', api => api.getBranch(projectId, branchName)));
  }

  private async getBranchCommitsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const matches = parseApiBranchId((<any> request.params).branchId);
    if (!matches) {
      throw Boom.badRequest('Invalid branch id');
    }
    const { projectId, branchName } = matches;
    const { until, count } = request.query;
    const untilMoment = moment(until);
    if (!untilMoment.isValid) {
      throw Boom.badRequest('Until is not in valid format');
    }
    return reply(this.getEntity('commit', api => api.getBranchCommits(projectId, branchName, untilMoment, count)));
  }

  private async getCommitHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const hash = (<any> request.params).hash as string;
    return reply(this.getEntity('commit', api => api.getCommit(projectId, hash)));
  }

  private async getActivityHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const filter = request.query.filter as string;
    const filterOptions = parseActivityFilter(filter);
    const { projectId, teamId } = filterOptions;
    const { until, count } = request.query;
    if (projectId !== null) {
      return reply(this.getEntity('activity', api => api.getProjectActivity(projectId, until, count)));
    }
    if (teamId !== null) {
      return reply(this.getEntity('activity', api => api.getTeamActivity(teamId, until, count)));
    }
    throw Boom.badRequest('team or project filter must be specified');
  }

  public getJsonApiModule() {
    return this.factory();
  }

  public async getProjectNotificationConfigurationsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    return reply(this.getEntity('notification', api => api.getProjectNotificationConfigurations(projectId)));
  }

  public async postNotificationConfigurationHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const config = request.payload.data.attributes;
    const id = await this.factory().createNotificationConfiguration(config);
    return reply(this.getEntity('notification',
      api => api.getNotificationConfiguration(id))).created('');
  }

  public async deleteNotificationConfigurationHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const id = (<any> request.params).id;
    await this.factory().deleteNotificationConfiguration(id);
    return reply({});
  }

}
