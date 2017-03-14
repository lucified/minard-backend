
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as moment from 'moment';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import { externalBaseUrlInjectSymbol } from '../server/types';
import { GitlabClient } from '../shared/gitlab-client';
import { parseApiBranchId, parseApiDeploymentId } from './conversions';
import { JsonApiModule } from './json-api-module';
import { serializeApiEntity } from './serialization';
import { ApiEntities, ApiEntity } from './types';
import { ViewEndpoints } from './view-endpoints';

function applyHeaders(obj: any) {
  obj.headers['content-type'] = 'application/vnd.api+json; charset=utf-8';
  obj.headers['Access-Control-Allow-Origin'] = '*';
}

function onPreResponse(_server: Hapi.Server, request: Hapi.Request, reply: Hapi.IReply) {
  const response = request.response;

  if (!request.path.startsWith('/api')) {
    return reply.continue();
  }

  if (request.method === 'options') {
    return reply.continue();
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

  constructor(
    @inject(JsonApiModule.injectSymbol) private readonly jsonApi: JsonApiModule,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string,
    @inject(ViewEndpoints.injectSymbol) private readonly viewEndpoints: ViewEndpoints,
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    ) {
    this.register.attributes = {
      name: 'json-api-plugin',
      version: '1.0.0',
    };
    this.baseUrl = baseUrl + '/api';
  }

  public register: HapiRegister = (server, _options, next) => {

    server.ext('onPreResponse', onPreResponse.bind(undefined, server));

    server.route({
      method: 'GET',
      path: '/deployments/{projectId}-{deploymentId}',
      handler: {
        async: this.getDeploymentHandler,
      },
      config: {
        bind: this,
        cors: true,
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
      path: '/preview/{projectId}-{deploymentId}',
      handler: {
        async: this.getPreviewHandler,
      },
      config: {
        bind: this,
        cors: true,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
          query: {
            sha: Joi.string().required(),
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
        cors: true,
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
        auth: 'customAuthorize',
        pre: [{
          method: this.authorizeProjectCreation,
          assign: 'teamId',
        }],
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('projects').required(),
              attributes: Joi.object({
                name: Joi.string().regex(projectNameRegex).max(220).required(),
                description: Joi.string().allow('').max(2000),
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
        bind: this,
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
                name: Joi.string().regex(projectNameRegex).max(220),
                description: Joi.string().allow('').max(2000),
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
        cors: true,
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
        cors: true,
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
        cors: true,
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
        cors: true,
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
        cors: true,
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
        cors: true,
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
        cors: true,
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
        auth: 'customAuthorize',
        pre: [{
          method: this.authorizeNotificationConfiguration,
          assign: 'config',
        }],
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('notifications').required(),
              attributes: Joi.alternatives(
                Joi.object({
                  type: Joi.string().equal('flowdock').required(),
                  teamId: Joi.number(),
                  projectId: Joi.number(),
                  flowToken: Joi.string().alphanum().required(),
                }),
                Joi.object({
                  type: Joi.string().equal('hipchat').required(),
                  projectId: Joi.number(),
                  teamId: Joi.number(),
                  hipchatRoomId: Joi.number().required(),
                  hipchatAuthToken: Joi.string().required(),
                }),
              ),
            }).required(),
          },
        },
      },
    });

    server.route({
      method: 'DELETE',
      path: '/comments/{id}',
      handler: {
        async: this.deleteCommentHandler,
      },
      config: {
        bind: this,
        cors: true,
        validate: {
          params: {
            id: Joi.number().required(),
          },
        },
      },
    });

    server.route({
      method: 'POST',
      path: '/comments',
      handler: {
        async: this.createCommentHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: 'customAuthorize',
        pre: [{
          method: this.authorizeCommentCreation,
          assign: 'deploymentId',
        }],
        validate: {
          payload: {
            data: Joi.object({
              type: Joi.string().equal('comments').required(),
              attributes: Joi.object({
                email: Joi.string().email().required(),
                message: Joi.string().required(),
                name: Joi.string().allow('').max(50),
                deployment: Joi.string().required(),
              }),
            }).required(),
          },
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/comments/deployment/{projectId}-{deploymentId}',
      handler: {
        async: this.getDeploymentCommentsHandler,
      },
      config: {
        bind: this,
        cors: true,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    });

    next();
  }

  public serializeApiEntity(type: string, entity: any) {
    return serializeApiEntity(type, entity, this.baseUrl);
  }

  public async getEntity(type: string, entityFetcher: (api: JsonApiModule) => apiReturn) {
    const entity = await entityFetcher(this.jsonApi);
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

  private async authorizeProjectCreation(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.payload.data.relationships.team.data.id, 10);
      const team = await this.gitlab.getGroup(teamId, request.auth.credentials.username);
      if (team.id === teamId) {
        return reply(teamId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  private async postProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, description, templateProjectId } = request.payload.data.attributes;
    const teamId = request.pre.teamId;
    const project = await this.jsonApi.createProject(teamId, name, description, templateProjectId);
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
    const project = await this.jsonApi.editProject(projectId, attributes);
    return reply(this.serializeApiEntity('project', project));
  }

  private async deleteProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    await this.jsonApi.deleteProject(projectId);
    return reply({});
  }

  private async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const deploymentId = Number((<any> request.params).deploymentId);
    return reply(this.getEntity('deployment', api => api.getDeployment(projectId, deploymentId)));
  }

  private async getPreviewHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((<any> request.params).projectId);
    const deploymentId = Number((<any> request.params).deploymentId);
    const sha = request.query.sha;
    const preview = await this.viewEndpoints.getPreview(projectId, deploymentId, sha);
    if (!preview) {
      throw Boom.notFound();
    }
    return reply(preview);
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
    return this.jsonApi;
  }

  public async getProjectNotificationConfigurationsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    return reply(this.getEntity('notification', api => api.getProjectNotificationConfigurations(projectId)));
  }

  private async authorizeNotificationConfiguration(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const config = request.payload.data.attributes;

      config.teamId = config.teamId || null;
      config.projectId = config.projectId || null;

      if (!config.teamId && !config.projectId) {
        return reply(Boom.badRequest('teamId or projectId should be defined'));
      }
      if (config.teamId && config.projectId) {
        return reply(Boom.badRequest('teamId and projectId should not both be defined'));
      }
      if (config.projectId) {
        const project = await this.gitlab.getProject(config.projectId, request.auth.credentials.username);
        if (project.id === config.projectId) {
          return reply(config);
        }
      }
      if (config.teamId) {
        const team = await this.gitlab.getGroup(config.teamId, request.auth.credentials.username);
        if (team.id === config.teamId) {
          return reply(config);
        }
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async postNotificationConfigurationHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const id = await this.jsonApi.createNotificationConfiguration(request.pre.config);
    return reply(this.getEntity('notification', async (api) => {
      const configuration = await api.getNotificationConfiguration(id);
      return configuration!;
    })).created('');
  }

  public async deleteNotificationConfigurationHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const id = (<any> request.params).id;
    await this.jsonApi.deleteNotificationConfiguration(id);
    return reply({});
  }

  private async authorizeCommentCreation(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const deploymentId = request.payload.data.attributes.deployment;
      const parsed = parseApiDeploymentId(deploymentId);
      if (!parsed) {
        return reply(Boom.badRequest('Invalid deployment id'));
      }
      const project = await this.gitlab.getProject(parsed.projectId, request.auth.credentials.username);
      if (project.id === parsed.projectId) {
        return reply(parsed.deploymentId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async createCommentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, email, message } = request.payload.data.attributes;
    const comment = await this.jsonApi.addComment(
        request.pre.deploymentId, email, message, name || undefined);
    return reply(this.serializeApiEntity('comment', comment))
      .created(`/api/comments/${comment.id}`);
  }

  public async deleteCommentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { id } = request.params;
    await this.jsonApi.deleteComment(Number(id));
    return reply({});
  }

  public async getDeploymentCommentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { deploymentId } = request.params;
    return reply(this.getEntity('comment', api => api.getDeploymentComments(Number(deploymentId))));
  }

}
