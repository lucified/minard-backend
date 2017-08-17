import { badRequest, forbidden, notFound, unauthorized, wrap } from 'boom';
import * as camelcase from 'camelcase';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import { mapKeys } from 'lodash';
import * as moment from 'moment';

import {
  STRATEGY_ROUTELEVEL_USER_HEADER,
  STRATEGY_TOPLEVEL_USER_HEADER,
} from '../authentication/types';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { externalBaseUrlInjectSymbol } from '../server/types';
import { maskErrors } from '../shared/errors';
import TokenGenerator from '../shared/token-generator';
import { parseApiBranchId, parseApiDeploymentId } from './conversions';
import { JsonApiModule } from './json-api-module';
import { serializeApiEntity } from './serialization';
import { ApiEntities, ApiEntity, PreviewType } from './types';
import { ViewEndpoints } from './view-endpoints';

function applyHeaders(headers: { [key: string]: string }) {
  headers['content-type'] = 'application/vnd.api+json; charset=utf-8';
  headers['Access-Control-Allow-Origin'] = '*';
}

function onPreResponse(
  _server: Hapi.Server,
  request: Hapi.Request,
  reply: Hapi.ReplyWithContinue,
) {
  const response = request.response;
  if (!response) {
    return reply.continue();
  }

  if (!request.path.startsWith('/api') || request.method === 'options') {
    return reply.continue();
  }

  if (response.isBoom && response.output) {
    // let 401's through to be able to redirect
    if (
      request.auth.isAuthenticated ||
      request.auth.credentials ||
      response.output.statusCode !== 401 ||
      !request.path.startsWith('/api/preview')
    ) {
      maskErrors(response);
    }
    applyHeaders(response.output.headers);
  } else {
    applyHeaders(response.headers);
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

function convertKeysToCamelCase(obj: { [key: string]: any }) {
  return mapKeys(obj, (_value, key: string) => camelcase(key));
}

type apiReturn = Promise<ApiEntity | ApiEntities | null>;

const projectNameRegex = /^[\w|\-]+$/;

// https://github.com/Microsoft/TypeScript/issues/5579
const TEAM_OR_PROJECT_PRE_KEY = 'teamOrProject';
const DEPLOYMENT_PRE_KEY = 'deployment';
@injectable()
export class JsonApiHapiPlugin extends HapiPlugin {
  public static injectSymbol = Symbol('json-api-hapi-plugin');

  private baseUrl: string;

  constructor(
    @inject(JsonApiModule.injectSymbol) private readonly jsonApi: JsonApiModule,
    @inject(externalBaseUrlInjectSymbol) baseUrl: string,
    @inject(ViewEndpoints.injectSymbol)
    private readonly viewEndpoints: ViewEndpoints,
    @inject(TokenGenerator.injectSymbol)
    private readonly tokenGenerator: TokenGenerator,
  ) {
    super({
      name: 'json-api-plugin',
      version: '1.0.0',
    });
    this.baseUrl = baseUrl + '/api';
    this.getDeploymentId = this.getDeploymentId.bind(this);
    this.validatePreviewToken = this.validatePreviewToken.bind(this);
  }

  public register(
    server: Hapi.Server,
    _options: Hapi.ServerOptions,
    next: () => void,
  ) {
    server.ext('onPreResponse', onPreResponse.bind(undefined, server));

    // Open auth can only be used if the request contains a project, branch or
    // team ID, otherwise it will fail.
    const openAuth: Hapi.AuthOptions = {
      mode: 'try',
      strategies: [STRATEGY_TOPLEVEL_USER_HEADER],
    };

    const deployment: Hapi.RouteConfiguration[] = [
      {
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
      },
    ];

    const preview: Hapi.RouteConfiguration[] = [
      {
        method: 'GET',
        path: '/preview/deployment/{projectId}-{deploymentId}/{token}',
        handler: {
          async: this.getPreviewHandler,
        },
        config: {
          bind: this,
          auth: openAuth,
          pre: [
            this.validatePreviewToken(PreviewType.DEPLOYMENT),
            {
              method: this.getDeploymentId(PreviewType.DEPLOYMENT),
              assign: DEPLOYMENT_PRE_KEY,
            },
            this.authorizeOpenDeployment,
          ],
          validate: {
            params: {
              projectId: Joi.number().required(),
              deploymentId: Joi.number().required(),
              token: Joi.string().required(),
            },
          },
        },
      },
      {
        method: 'GET',
        path: '/preview/branch/{branchId}/{token}',
        handler: {
          async: this.getPreviewHandler,
        },
        config: {
          bind: this,
          auth: openAuth,
          pre: [
            this.validatePreviewToken(PreviewType.BRANCH),
            {
              method: this.getDeploymentId(PreviewType.BRANCH),
              assign: DEPLOYMENT_PRE_KEY,
            },
            this.authorizeOpenDeployment,
          ],
          validate: {
            params: {
              branchId: Joi.string().required(),
              token: Joi.string().required(),
            },
          },
        },
      },
      {
        method: 'GET',
        path: '/preview/project/{projectId}/{token}',
        handler: {
          async: this.getPreviewHandler,
        },
        config: {
          bind: this,
          auth: openAuth,
          pre: [
            this.validatePreviewToken(PreviewType.PROJECT),
            {
              method: this.getDeploymentId(PreviewType.PROJECT),
              assign: DEPLOYMENT_PRE_KEY,
            },
            this.authorizeOpenDeployment,
          ],
          validate: {
            params: {
              projectId: Joi.number().required(),
              token: Joi.string().required(),
            },
          },
        },
      },
    ];

    const project: Hapi.RouteConfiguration[] = [
      {
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
      },
      {
        method: 'POST',
        path: '/projects',
        handler: {
          async: this.postProjectHandler,
        },
        config: {
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          bind: this,
          pre: [
            {
              method: this.authorizeProjectCreation,
              assign: 'teamId',
            },
          ],
          validate: {
            payload: {
              data: Joi.object({
                type: Joi.string().equal('projects').required(),
                attributes: Joi.object({
                  name: Joi.string()
                    .regex(projectNameRegex)
                    .max(220)
                    .required(),
                  description: Joi.string().allow('').max(2000),
                  'template-project-id': Joi.number(),
                  'is-public': Joi.boolean(),
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
      },
      {
        method: 'DELETE',
        path: '/projects/{projectId}',
        handler: {
          async: this.deleteProjectHandler,
        },
        config: {
          bind: this,
          validate: {
            params: {
              projectId: Joi.number().required(),
            },
          },
        },
      },
      {
        method: 'PATCH',
        path: '/projects/{projectId}',
        handler: {
          async: this.patchProjectHandler,
        },
        config: {
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
                  name: Joi.string().regex(projectNameRegex).max(220),
                  description: Joi.string().allow('').max(2000),
                  'is-public': Joi.boolean(),
                }).required(),
              }).required(),
            },
          },
        },
      },
      {
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
      },
    ];

    const team: Hapi.RouteConfiguration[] = [
      {
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
      },
    ];

    const branch: Hapi.RouteConfiguration[] = [
      {
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
      },
      {
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
      },
    ];

    const commit: Hapi.RouteConfiguration[] = [
      {
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
      },
    ];

    const activity: Hapi.RouteConfiguration[] = [
      {
        method: 'GET',
        path: '/activity',
        handler: {
          async: this.getActivityHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          pre: [
            {
              method: this.parseActivityFilter,
              assign: TEAM_OR_PROJECT_PRE_KEY,
            },
            {
              method: this.authorizeTeamOrProjectAccess,
              assign: 'filter',
            },
          ],
          validate: {
            query: {
              until: Joi.date(),
              count: Joi.number(),
              filter: Joi.string(),
            },
          },
        },
      },
    ];

    const notification: Hapi.RouteConfiguration[] = [
      {
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
      },
      {
        method: 'GET',
        path: '/teams/{teamId}/relationships/notification',
        handler: {
          async: this.getTeamNotificationConfigurationsHandler,
        },
        config: {
          bind: this,
          validate: {
            params: {
              teamId: Joi.number().required(),
            },
          },
        },
      },
      {
        method: 'DELETE',
        path: '/notifications/{id}',
        handler: {
          async: this.deleteNotificationConfigurationHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          pre: [
            {
              method: this.authorizeNotificationRemoval,
              assign: 'notificationId',
            },
          ],
          validate: {
            params: {
              id: Joi.number().required(),
            },
          },
        },
      },
      {
        method: 'POST',
        path: '/notifications',
        handler: {
          async: this.postNotificationConfigurationHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          pre: [
            {
              method: this.tryGetNotificationConfiguration,
              assign: TEAM_OR_PROJECT_PRE_KEY,
            },
            {
              method: this.authorizeTeamOrProjectAccess,
              assign: 'config',
            },
          ],
          validate: {
            payload: {
              data: Joi.object({
                type: Joi.string().equal('notifications').required(),
                attributes: Joi.alternatives(
                  Joi.object({
                    type: Joi.string().equal('flowdock').required(),
                    'team-id': Joi.number(),
                    'project-id': Joi.string(),
                    'flow-token': Joi.string().alphanum().required(),
                  }),
                  Joi.object({
                    type: Joi.string().equal('hipchat').required(),
                    'project-id': Joi.string(),
                    'team-id': Joi.number(),
                    'hipchat-room-id': Joi.number().required(),
                    'hipchat-auth-token': Joi.string().required(),
                  }),
                  Joi.object({
                    type: Joi.string().equal('slack').required(),
                    'team-id': Joi.number(),
                    'project-id': Joi.string(),
                    'slack-webhook-url': Joi.string().required(),
                  }),
                  Joi.object({
                    type: Joi.string().equal('github').required(),
                    'team-id': Joi.number().required(),
                    'github-app-id': Joi.number().required(),
                    'github-app-private-key': Joi.string().required(),
                    'github-installation-id': Joi.number().required(),
                  }),
                  Joi.object({
                    type: Joi.string().equal('github').required(),
                    'project-id': Joi.string().required(),
                    'github-owner': Joi.string().required(),
                    'github-repo': Joi.string().required(),
                  }),
                ),
              }).required(),
            },
          },
        },
      },
    ];

    const comment: Hapi.RouteConfiguration[] = [
      {
        method: 'DELETE',
        path: '/comments/{id}',
        handler: {
          async: this.deleteCommentHandler,
        },
        config: {
          bind: this,
          auth: STRATEGY_ROUTELEVEL_USER_HEADER,
          pre: [
            {
              method: this.authorizeCommentRemoval,
              assign: 'commentId',
            },
          ],
          validate: {
            params: {
              id: Joi.number().required(),
            },
          },
        },
      },
      {
        method: 'POST',
        path: '/comments',
        handler: {
          async: this.postCommentHandler,
        },
        config: {
          bind: this,
          // Open auth cannot be used here because the request does not contain
          // a deployment, branch or team ID.
          auth: {
            mode: 'try',
            strategies: [STRATEGY_ROUTELEVEL_USER_HEADER],
          },
          pre: [
            {
              method: this.authorizeCommentCreation,
              assign: 'deploymentId',
            },
          ],
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
      },
      {
        method: 'GET',
        path: '/comments/deployment/{projectId}-{deploymentId}',
        handler: {
          async: this.getDeploymentCommentsHandler,
        },
        config: {
          bind: this,
          auth: openAuth,
          pre: [
            {
              method: this.getDeploymentId(PreviewType.DEPLOYMENT),
              assign: DEPLOYMENT_PRE_KEY,
            },
            this.authorizeOpenDeployment,
          ],
          validate: {
            params: {
              projectId: Joi.number().required(),
              deploymentId: Joi.number().required(),
            },
          },
        },
      },
    ];
    const routes = deployment.concat(
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

  public async getEntity(
    type: string,
    entityFetcher: (api: JsonApiModule) => apiReturn,
  ) {
    const entity = await entityFetcher(this.jsonApi);
    if (!entity) {
      throw notFound(`${type} not found`);
    }
    return this.serializeApiEntity(type, entity);
  }

  public async getProjectHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    return reply(this.getEntity('project', api => api.getProject(projectId)));
  }

  public async getProjectBranchesHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    return reply(
      this.getEntity('branch', api => api.getProjectBranches(projectId)),
    );
  }

  public async getProjectsHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const teamId = Number(request.params.teamId);
    return reply(this.getEntity('project', api => api.getProjects(teamId)));
  }

  public async authorizeProjectCreation(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const teamId = parseInt(
        request.payload.data.relationships.team.data.id,
        10,
      );
      if (await request.userHasAccessToTeam(teamId)) {
        return reply(teamId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(unauthorized());
  }

  public async postProjectHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const {
      name,
      description,
      templateProjectId,
      isPublic,
    } = convertKeysToCamelCase(request.payload.data.attributes);
    const teamId = getPre(request).teamId;
    const project = await this.jsonApi.createProject(
      teamId,
      name,
      description,
      templateProjectId,
      isPublic,
    );
    return reply(this.serializeApiEntity('project', project)).created(
      `/api/projects/${project.id}`,
    );
  }

  public async patchProjectHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const camelcaseAttributes = convertKeysToCamelCase(
      request.payload.data.attributes,
    );
    const projectId = Number(request.params.projectId);
    if (
      camelcaseAttributes.name === undefined &&
      camelcaseAttributes.description === undefined &&
      camelcaseAttributes.isPublic === undefined
    ) {
      // Require that at least something is edited
      throw badRequest();
    }
    const project = await this.jsonApi.editProject(
      projectId,
      camelcaseAttributes,
    );
    return reply(this.serializeApiEntity('project', project));
  }

  public async deleteProjectHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    await this.jsonApi.deleteProject(projectId);
    return reply({});
  }

  public async getDeploymentHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    const deploymentId = Number(request.params.deploymentId);
    return reply(
      this.getEntity('deployment', api =>
        api.getDeployment(projectId, deploymentId),
      ),
    );
  }

  public validatePreviewToken(previewType: PreviewType) {
    return (request: Hapi.Request, reply: Hapi.ReplyNoContinue) => {
      const {
        token,
        branchId,
        deploymentId: deploymentIdString,
        projectId: projectIdString,
      } = request.params;
      const deploymentId = Number(deploymentIdString);
      let correctToken;

      switch (previewType) {
        case PreviewType.PROJECT:
          correctToken = this.tokenGenerator.projectToken(
            Number(projectIdString),
          );
          break;
        case PreviewType.BRANCH:
          const matches = parseApiBranchId(branchId);
          if (!matches) {
            return reply(badRequest('Invalid branch id'));
          }
          const { projectId, branchName } = matches;
          correctToken = this.tokenGenerator.branchToken(projectId, branchName);
          break;
        case PreviewType.DEPLOYMENT:
          correctToken = this.tokenGenerator.deploymentToken(
            Number(projectIdString),
            deploymentId,
          );
          break;
        default:
          return reply(badRequest('Invalid token data'));
      }

      if (!token || token !== correctToken) {
        return reply(forbidden('Invalid token'));
      }

      return reply('ok');
    };
  }

  public async getPreviewHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const projectId = Number(getPre(request)[DEPLOYMENT_PRE_KEY].projectId);
      const deploymentId = Number(
        getPre(request)[DEPLOYMENT_PRE_KEY].deploymentId,
      );
      const preview = await this.viewEndpoints.getPreview(
        projectId,
        deploymentId,
      );
      if (preview) {
        return reply(preview);
      }
    } catch (err) {
      return reply(wrap(err));
    }

    return reply(notFound());
  }

  public async getBranchHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const matches = parseApiBranchId(request.params.branchId);
    if (!matches) {
      throw badRequest('Invalid branch id');
    }
    const { projectId, branchName } = matches;
    return reply(
      this.getEntity('branch', api => api.getBranch(projectId, branchName)),
    );
  }

  public async getBranchCommitsHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const matches = parseApiBranchId(request.params.branchId);
    if (!matches) {
      throw badRequest('Invalid branch id');
    }
    const { projectId, branchName } = matches;
    const { until, count } = getQuery(request);
    const untilMoment = moment(until);
    if (!untilMoment.isValid) {
      throw badRequest('Until is not in valid format');
    }
    return reply(
      this.getEntity('commit', api =>
        api.getBranchCommits(projectId, branchName, untilMoment, count),
      ),
    );
  }

  public async getCommitHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    const hash = request.params.hash;
    return reply(
      this.getEntity('commit', api => api.getCommit(projectId, hash)),
    );
  }

  public parseActivityFilter(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const filter: string = getQuery(request).filter;
      return reply(parseActivityFilter(filter));
    } catch (exception) {
      return reply(badRequest());
    }
  }

  public async getActivityHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const filter = getPre(request).filter;
    const { until, count } = getQuery(request);
    if (filter.projectId) {
      return reply(
        this.getEntity('activity', api =>
          api.getProjectActivity(filter.projectId, until, count),
        ),
      );
    }
    if (filter.teamId) {
      return reply(
        this.getEntity('activity', api =>
          api.getTeamActivity(filter.teamId, until, count),
        ),
      );
    }
    throw badRequest('team or project filter must be specified');
  }

  public getJsonApiModule() {
    return this.jsonApi;
  }

  public async getProjectNotificationConfigurationsHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = Number(request.params.projectId);
    return reply(
      this.getEntity('notification', api =>
        api.getProjectNotificationConfigurations(projectId),
      ),
    );
  }

  public async getTeamNotificationConfigurationsHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const teamId = Number(request.params.teamId);
    return reply(
      this.getEntity('notification', api =>
        api.getTeamNotificationConfigurations(teamId),
      ),
    );
  }

  public async tryGetNotificationConfiguration(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const attributes = convertKeysToCamelCase(request.payload.data.attributes);
      if (attributes.projectId) {
        attributes.projectId = Number(attributes.projectId);
      }
      reply(attributes);
    } catch (error) {
      reply(badRequest());
    }
  }

  public async authorizeTeamOrProjectAccess(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const pre = getPre(request)[TEAM_OR_PROJECT_PRE_KEY];
      const { teamId, projectId } = pre;
      if (!teamId && !projectId) {
        return reply(badRequest('teamId or projectId should be defined'));
      }
      if (teamId && projectId) {
        return reply(
          badRequest('teamId and projectId should not both be defined'),
        );
      }
      if (projectId && (await request.userHasAccessToProject(projectId))) {
        return reply(pre);
      }
      if (teamId && (await request.userHasAccessToTeam(teamId))) {
        return reply(pre);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(unauthorized());
  }

  public async getNotificationConfiguration(
    notificationConfigurationId: number,
  ) {
    return this.jsonApi.getNotificationConfiguration(
      notificationConfigurationId,
    );
  }

  public async authorizeNotificationRemoval(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const id = Number(request.params.id);
      const configuration = await this.getNotificationConfiguration(id);
      if (!configuration) {
        throw new Error(
          `Tried to remove a nonexistent notification configuration ${id}`,
        );
      }
      const { projectId, teamId } = configuration;
      if (projectId && (await request.userHasAccessToProject(projectId))) {
        return reply(id);
      }
      if (teamId && (await request.userHasAccessToTeam(teamId))) {
        return reply(id);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(unauthorized());
  }

  public async postNotificationConfigurationHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const id = await this.jsonApi.createNotificationConfiguration(
      getPre(request).config,
    );
    return reply(
      this.getEntity('notification', async api => {
        const configuration = await api.getNotificationConfiguration(id);
        return configuration!;
      }),
    ).created('');
  }

  public async deleteNotificationConfigurationHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const id = request.params.id;
    await this.jsonApi.deleteNotificationConfiguration(Number(id));
    return reply({});
  }

  public async authorizeCommentCreation(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const deploymentId = request.payload.data.attributes.deployment;
      const parsed = parseApiDeploymentId(deploymentId);
      if (!parsed) {
        return reply(badRequest('Invalid deployment id'));
      }
      if (
        await request.userHasAccessToDeployment(
          parsed.projectId,
          deploymentId,
          request.auth.credentials,
        )
      ) {
        return reply(parsed.deploymentId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(unauthorized());
  }

  public async getComment(commentId: number) {
    return await this.jsonApi.getComment(commentId);
  }

  public async authorizeCommentRemoval(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const commentId = Number(request.params.id);
      const comment = await this.getComment(commentId);
      const parsed = parseApiDeploymentId(comment.deployment);
      if (!parsed) {
        return reply(badRequest('Invalid deployment id'));
      }
      const { projectId, deploymentId } = parsed;
      if (
        await request.userHasAccessToDeployment(
          projectId,
          deploymentId,
          request.auth.credentials,
        )
      ) {
        return reply(commentId);
      }
    } catch (exception) {
      // TODO: log exception
    }
    return reply(unauthorized());
  }

  public async postCommentHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const { name, email, message } = request.payload.data.attributes;
    const comment = await this.jsonApi.addComment(
      getPre(request).deploymentId,
      email,
      message,
      name || undefined,
    );
    return reply(this.serializeApiEntity('comment', comment)).created(
      `/api/comments/${comment.id}`,
    );
  }

  public async deleteCommentHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    await this.jsonApi.deleteComment(getPre(request).commentId);
    return reply({});
  }

  public async getDeploymentCommentsHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const { deploymentId } = request.params;
    return reply(
      this.getEntity('comment', api =>
        api.getDeploymentComments(Number(deploymentId)),
      ),
    );
  }

  public getDeploymentId(previewType: PreviewType) {
    return async (request: Hapi.Request, reply: Hapi.ReplyNoContinue) => {
      const {
        branchId,
        deploymentId: deploymentIdString,
        projectId: projectIdString,
      } = request.params;

      let deploymentId;
      let projectId;
      let branchName;

      if (branchId) {
        const matches = parseApiBranchId(branchId);
        if (!matches) {
          return reply(badRequest('Invalid branch id'));
        }
        projectId = matches.projectId;
        branchName = matches.branchName;
      } else {
        projectId = Number(projectIdString);
      }

      if (Number.isNaN(projectId)) {
        return reply(badRequest('Invalid project id'));
      }

      switch (previewType) {
        case PreviewType.PROJECT:
          deploymentId = await this.getLatestSuccessfulDeploymentIdForProject(
            projectId,
          );
          break;
        case PreviewType.BRANCH:
          if (!branchName) {
            return reply(badRequest('Invalid branch name'));
          }
          deploymentId = await this.getLatestSuccessfulDeploymentIdForBranch(
            projectId,
            branchName,
          );
          break;
        case PreviewType.DEPLOYMENT:
          deploymentId = Number(deploymentIdString);
          break;
        default:
          return reply(badRequest('Invalid preview data'));
      }

      if (!deploymentId || Number.isNaN(deploymentId)) {
        return reply(notFound(`Unable to find deployment`));
      }

      return reply({
        projectId,
        deploymentId,
      });
    };
  }

  public async authorizeOpenDeployment(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    try {
      const projectId = Number(getPre(request)[DEPLOYMENT_PRE_KEY].projectId);
      const deploymentId = Number(
        getPre(request)[DEPLOYMENT_PRE_KEY].deploymentId,
      );
      if (
        await request.userHasAccessToDeployment(
          projectId,
          deploymentId,
          request.auth.credentials,
        )
      ) {
        return reply('ok');
      }
    } catch (err) {
      // Nothing to be done
    }
    return reply(unauthorized());
  }

  // These are public and wrapped mainly to ease mocking in unit testing
  public getLatestSuccessfulDeploymentIdForBranch(
    projectId: number,
    branch: string,
  ) {
    return this.jsonApi.getLatestSuccessfulDeploymentIdForBranch(
      projectId,
      branch,
    );
  }
  public getLatestSuccessfulDeploymentIdForProject(projectId: number) {
    return this.jsonApi.getLatestSuccessfulDeploymentIdForProject(projectId);
  }
}

function getPre(request: Hapi.Request) {
  return request.pre as any;
}

function getQuery(request: Hapi.Request) {
  return request.query as any;
}
