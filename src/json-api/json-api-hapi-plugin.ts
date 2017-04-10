
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as moment from 'moment';

import {
  AuthorizationStatus,
  RequestCredentials,
  STRATEGY_ROUTELEVEL_USER_HEADER,
} from '../authentication/types';
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import { externalBaseUrlInjectSymbol } from '../server/types';
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
    const output = (response as any).output;
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
}

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

// https://github.com/Microsoft/TypeScript/issues/5579
const TEAM_OR_PROJECT_PRE_KEY = 'teamOrProject';
interface TeamOrProject {
  teamOrProject: {
    teamId?: number;
    projectId?: number;
  };
}
@injectable()
export class JsonApiHapiPlugin {

  public static injectSymbol = Symbol('json-api-hapi-plugin');

  private baseUrl: string;

  constructor(
    @inject(JsonApiModule.injectSymbol) private readonly jsonApi: JsonApiModule,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string,
    @inject(ViewEndpoints.injectSymbol) private readonly viewEndpoints: ViewEndpoints,
  ) {
    this.register.attributes = {
      name: 'json-api-plugin',
      version: '1.0.0',
    };
    this.baseUrl = baseUrl + '/api';
  }

  public register: HapiRegister = (server, _options, next) => {

    server.ext('onPreResponse', onPreResponse.bind(undefined, server));

    const openAuth = {
      mode: 'try',
      strategies: [STRATEGY_ROUTELEVEL_USER_HEADER],
    };

    const deployment: Hapi.IRouteConfiguration[] = [{
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
    }];

    const preview: Hapi.IRouteConfiguration[] = [{
      method: 'GET',
      path: '/preview/{projectId}-{deploymentId}',
      handler: {
        async: this.getPreviewHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: openAuth,
        pre: [
          this.authorizeOpenDeployment,
        ],
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
    }];

    const project: Hapi.IRouteConfiguration[] = [{
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
    }, {
      method: 'POST',
      path: '/projects',
      handler: {
        async: this.postProjectHandler,
      },
      config: {
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
        bind: this,
        cors: true,
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
    }, {
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
    }, {
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
    }, {
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
    }];

    const team: Hapi.IRouteConfiguration[] = [{
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
    }];

    const branch: Hapi.IRouteConfiguration[] = [{
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
    }, {
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
    }];

    const commit: Hapi.IRouteConfiguration[] = [{
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
    }];

    const activity: Hapi.IRouteConfiguration[] = [{
      method: 'GET',
      path: '/activity',
      handler: {
        async: this.getActivityHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
        pre: [{
          method: this.parseActivityFilter,
          assign: TEAM_OR_PROJECT_PRE_KEY,
        }, {
          method: this.authorizeTeamOrProjectAccess,
          assign: 'filter',
        }],
        validate: {
          query: {
            until: Joi.date(),
            count: Joi.number(),
            filter: Joi.string(),
          },
        },
      },
    }];

    const notification: Hapi.IRouteConfiguration[] = [{
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
    }, {
      method: 'DELETE',
      path: '/notifications/{id}',
      handler: {
        async: this.deleteNotificationConfigurationHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
        pre: [{
          method: this.authorizeNotificationRemoval,
          assign: 'notificationId',
        }],
        validate: {
          params: {
            id: Joi.number().required(),
          },
        },
      },
    }, {
      method: 'POST',
      path: '/notifications',
      handler: {
        async: this.postNotificationConfigurationHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: STRATEGY_ROUTELEVEL_USER_HEADER,
        pre: [{
          method: this.tryGetNotificationConfiguration,
          assign: TEAM_OR_PROJECT_PRE_KEY,
        }, {
          method: this.authorizeTeamOrProjectAccess,
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
    }];

    const comment: Hapi.IRouteConfiguration[] = [{
      method: 'DELETE',
      path: '/comments/{id}',
      handler: {
        async: this.deleteCommentHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: openAuth,
        pre: [{
          method: this.authorizeCommentRemoval,
          assign: 'commentId',
        }],
        validate: {
          params: {
            id: Joi.number().required(),
          },
        },
      },
    }, {
      method: 'POST',
      path: '/comments',
      handler: {
        async: this.postCommentHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: openAuth,
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
    }, {
      method: 'GET',
      path: '/comments/deployment/{projectId}-{deploymentId}',
      handler: {
        async: this.getDeploymentCommentsHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: openAuth,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    }];
    const routes =  deployment.concat(
      comment,
      notification,
      project,
      branch,
      commit,
      team,
      activity,
      preview,
    );
    server.route(routes);
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

  public async getProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (request.params as any).projectId;
    return reply(this.getEntity('project', api => api.getProject(projectId)));
  }

  public async getProjectBranchesHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (request.params as any).projectId;
    return reply(this.getEntity('branch', api => api.getProjectBranches(projectId)));
  }

  public async getProjectsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const teamId = (request.params as any).teamId;
    return reply(this.getEntity('project', api => api.getProjects(teamId)));
  }

  public async authorizeProjectCreation(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.payload.data.relationships.team.data.id, 10);
      if (await request.userHasAccessToTeam(teamId)) {
        return reply(teamId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async postProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, description, templateProjectId } = request.payload.data.attributes;
    const teamId = request.pre.teamId;
    const project = await this.jsonApi.createProject(teamId, name, description, templateProjectId);
    return reply(this.serializeApiEntity('project', project))
      .created(`/api/projects/${project.id}`);
  }

  public async patchProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const attributes = request.payload.data.attributes;
    const projectId = (request.params as any).projectId;
    if (!attributes.name && !attributes.description) {
      // Require that at least something is edited
      throw Boom.badRequest();
    }
    const project = await this.jsonApi.editProject(projectId, attributes);
    return reply(this.serializeApiEntity('project', project));
  }

  public async deleteProjectHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (request.params as any).projectId;
    await this.jsonApi.deleteProject(projectId);
    return reply({});
  }

  public async getDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((request.params as any).projectId);
    const deploymentId = Number((request.params as any).deploymentId);
    return reply(this.getEntity('deployment', api => api.getDeployment(projectId, deploymentId)));
  }

  public async getPreviewHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const projectId = Number(request.params.projectId);
      const deploymentId = Number(request.params.deploymentId);
      const sha = request.query.sha;
      const credentials = request.auth.credentials as RequestCredentials;
      if (
        (credentials && credentials.authorizationStatus === AuthorizationStatus.AUTHORIZED) ||
        await request.isOpenDeployment(projectId, deploymentId)
      ) {
        const preview = await this.viewEndpoints.getPreview(projectId, deploymentId, sha);
        if (preview) {
          return reply(preview);
        }
      }
    } catch (err) {
      return reply(Boom.wrap(err));
    }
    return reply(Boom.notFound());

  }

  public async getBranchHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const matches = parseApiBranchId((request.params as any).branchId);
    if (!matches) {
      throw Boom.badRequest('Invalid branch id');
    }
    const { projectId, branchName } = matches;
    return reply(this.getEntity('branch', api => api.getBranch(projectId, branchName)));
  }

  public async getBranchCommitsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const matches = parseApiBranchId((request.params as any).branchId);
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

  public async getCommitHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = Number((request.params as any).projectId);
    const hash = (request.params as any).hash as string;
    return reply(this.getEntity('commit', api => api.getCommit(projectId, hash)));
  }

  public parseActivityFilter(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const filter = request.query.filter as string;
      return reply(parseActivityFilter(filter));
    } catch (exception) {
      return reply(Boom.badRequest());
    }
  }

  public async getActivityHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const filter = request.pre.filter;
    const { until, count } = request.query;
    if (filter.projectId) {
      return reply(this.getEntity('activity', api => api.getProjectActivity(filter.projectId, until, count)));
    }
    if (filter.teamId) {
      return reply(this.getEntity('activity', api => api.getTeamActivity(filter.teamId, until, count)));
    }
    throw Boom.badRequest('team or project filter must be specified');
  }

  public getJsonApiModule() {
    return this.jsonApi;
  }

  public async getProjectNotificationConfigurationsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (request.params as any).projectId;
    return reply(this.getEntity('notification', api => api.getProjectNotificationConfigurations(projectId)));
  }

  public async tryGetNotificationConfiguration(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      reply(request.payload.data.attributes);
    } catch (error) {
      reply(Boom.badRequest());
    }
  }

  public async authorizeTeamOrProjectAccess(
    request: Hapi.RequestDecorators & { pre: TeamOrProject },
    reply: Hapi.IReply,
  ) {
    try {
      const pre = request.pre[TEAM_OR_PROJECT_PRE_KEY];
      const { teamId, projectId } = pre;
      if (!teamId && !projectId) {
        return reply(Boom.badRequest('teamId or projectId should be defined'));
      }
      if (teamId && projectId) {
        return reply(Boom.badRequest('teamId and projectId should not both be defined'));
      }
      if (projectId && await request.userHasAccessToProject(projectId)) {
        return reply(pre);
      }
      if (teamId && await request.userHasAccessToTeam(teamId)) {
        return reply(pre);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async getNotificationConfiguration(notificationConfigurationId: number) {
    return this.jsonApi.getNotificationConfiguration(notificationConfigurationId);
  }

  public async authorizeNotificationRemoval(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const id = Number(request.params.id);
      const configuration = await this.getNotificationConfiguration(id);
      if (!configuration) {
        throw new Error(`Tried to remove a nonexistent notification configuration ${id}`);
      }
      const { projectId, teamId } = configuration;
      if (projectId && await request.userHasAccessToProject(projectId)) {
        return reply(id);
      }
      if (teamId && await request.userHasAccessToTeam(teamId)) {
        return reply(id);
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
    const id = request.params.id;
    await this.jsonApi.deleteNotificationConfiguration(Number(id));
    return reply({});
  }

  public async authorizeCommentCreation(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const deploymentId = request.payload.data.attributes.deployment;
      const parsed = parseApiDeploymentId(deploymentId);
      if (!parsed) {
        return reply(Boom.badRequest('Invalid deployment id'));
      }
      if (await request.userHasAccessToDeployment(parsed.projectId, deploymentId, request.auth.credentials)) {
        return reply(parsed.deploymentId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async getComment(commentId: number) {
    return (await this.jsonApi.getComment(commentId));
  }

  public async authorizeCommentRemoval(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const commentId = Number(request.params.id);
      const comment = await this.getComment(commentId);
      const parsed = parseApiDeploymentId(comment.deployment);
      if (
        parsed &&
          await request.userHasAccessToDeployment(parsed.projectId, parsed.deploymentId, request.auth.credentials)
      ) {
        return reply(commentId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(Boom.unauthorized());
  }

  public async postCommentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { name, email, message } = request.payload.data.attributes;
    const comment = await this.jsonApi.addComment(
      request.pre.deploymentId, email, message, name || undefined);
    return reply(this.serializeApiEntity('comment', comment))
      .created(`/api/comments/${comment.id}`);
  }

  public async deleteCommentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    await this.jsonApi.deleteComment(request.pre.commentId);
    return reply({});
  }

  public async getDeploymentCommentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const { deploymentId } = request.params;
    return reply(this.getEntity('comment', api => api.getDeploymentComments(Number(deploymentId))));
  }

  public async authorizeOpenDeployment(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const projectId = parseInt(request.params.projectId, 10);
      const deploymentId = parseInt(request.params.deploymentId, 10);
      return reply(await request.userHasAccessToDeployment(projectId, deploymentId, request.auth.credentials));
    } catch (err) {
      // Nothing to be done
    }
    return reply(Boom.unauthorized());
  }

}
