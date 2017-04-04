import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import { isNil, omitBy } from 'lodash';
import * as moment from 'moment';

import {
  createActivityEvent,
  MinardActivity,
} from '../activity';
import {
  COMMENT_ADDED_EVENT_TYPE,
  COMMENT_DELETED_EVENT_TYPE,
  CommentAddedEvent,
  CommentDeletedEvent,
  createCommentAddedEvent,
  createCommentDeletedEvent,
} from '../comment';
import {
  createDeploymentEvent,
  DeploymentEvent,
} from '../deployment';
import { eventBusInjectSymbol, PersistentEventBus } from '../event-bus/';
import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import {
  ApiEntity,
  toApiBranchId,
  toApiCommitId,
  toApiDeploymentId,
} from '../json-api';
import {
  codePushed,
  CodePushedEvent,
  projectCreated,
  ProjectCreatedEvent,
  projectDeleted,
  ProjectDeletedEvent,
  projectEdited,
  ProjectEditedEvent,
} from '../project';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import {
  Event,
  eventCreator,
  isPersistedEvent,
  isType,
  PersistedEvent,
  StreamingEvent,
} from '../shared/events';
import * as logger from '../shared/logger';
import { ObservableWrapper } from './observable-wrapper';
import {
  StreamingCodePushedEvent,
  StreamingCommentDeletedEvent,
  StreamingDeploymentEvent,
} from './types';

export const PING_INTERVAL = 20000;

type StreamFactory = (request: Hapi.Request) => Promise<Observable<PersistedEvent<any>>>;

@injectable()
export class RealtimeHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private eventBusSubscription: Subscription;
  public readonly persistedEvents: Observable<PersistedEvent<any>>;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) private readonly jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) private readonly eventBus: PersistentEventBus,
    @inject(logger.loggerInjectSymbol) private readonly logger: logger.Logger,
  ) {
    super({
        name: 'realtime-plugin',
        version: '1.0.0',
    });
    this.persistedEvents = this.eventBus.getStream()
      .filter(isPersistedEvent)
      .map(event => event as PersistedEvent<any>)
      .share();

    // creates SSEEvents and posts them
    this.eventBusSubscription = this.getEnrichedStream()
      .subscribe(this.eventBus.post.bind(this.eventBus));

    this.getStream = this.getStream.bind(this);
  }

  private getEnrichedStream(): Observable<StreamingEvent<any>> {
    return this.enrich(this.eventBus.getStream())
      .catch(err => {
        this.logger.error('Error on enrich:', err);
        return this.getEnrichedStream();
      });
  }

  public register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {

    server.route([{
      method: 'GET',
      path: '/events/{teamId}',
      handler: {
        async: this.requestHandlerFactory(this.getStream),
      },
      config: {
        bind: this,
        auth: 'jwt-url',
        cors: true,
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    }, {
      method: 'GET',
      path: '/events/{teamId}/deployment/{projectId}-{deploymentId}',
      handler: {
        async: this.requestHandlerFactory(this.getStream),
      },
      config: {
        bind: this,
        auth: 'jwt-url',
        cors: true,
        validate: {
          params: {
            teamId: Joi.number().required(),
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    }]);
    next();
  }

  private async getStream(request: Hapi.Request) {
    const {teamId, projectId, deploymentId} = request.params;
    const _teamId = parseInt(teamId, 10);
    const since = parseInt(request.headers['last-event-id'], 10);
    let predicate = (event: PersistedEvent<any>) => event.teamId === _teamId;
    if (projectId && deploymentId) {
      const _projectId = parseInt(projectId, 10);
      const _deploymentId = parseInt(deploymentId, 10);
      predicate = deploymentEventFilter(_teamId, _projectId, _deploymentId);
    }
    let observable = Observable.concat(
      Observable.of(pingEventCreator()),
      this.persistedEvents.filter(predicate),
    );
    if (since && !isNaN(since)) {
      const existing = await this.eventBus.getEvents(_teamId, since);
      if (existing.length > 0) {
        existing.shift(); // getEvents is '>= since', but here we want '> since'
      }
      observable = Observable.concat(Observable.from(existing), observable);
    }
    observable = Observable.merge(
      Observable.interval(PING_INTERVAL).map(_ => pingEventCreator()),
      observable,
    );
    return observable;
  }

  private requestHandlerFactory(streamFactory: StreamFactory) {
    return async (request: Hapi.Request, reply: Hapi.IReply) => {
      try {
        // const observable = await this.getObservable(teamId, since ? parseInt(since, 10) : undefined);
        const observable = await streamFactory(request);
        const nodeStream = new ObservableWrapper(observable);
        reply(nodeStream)
          .header('content-type', 'text/event-stream')
          .header('content-encoding', 'identity');

        request.once('disconnect', () => {
          // Clean up on disconnect
          nodeStream.push(null);
        });

      } catch (err) {
        this.logger.error('Error handling a SSE request', err);
      }
    };
  }

  private enrich(stream: Observable<Event<any>>): Observable<StreamingEvent<any>> {
    return stream
      .flatMap(event => {
        if (isType<ProjectCreatedEvent>(event, projectCreated)) {
          return this.projectCreated(event);
        }

        if (isType<ProjectDeletedEvent>(event, projectDeleted)) {
          return Observable.of(this.toSSE(event, event.payload));
        }

        if (isType<ProjectEditedEvent>(event, projectEdited)) {
          return this.projectEdited(event);
        }

        if (isType<CodePushedEvent>(event, codePushed)) {
          return this.codePushed(event);
        }

        if (isType<MinardActivity>(event, createActivityEvent)) {
          return this.activity(event);
        }

        if (isType<DeploymentEvent>(event, createDeploymentEvent)) {
          return this.deployment(event);
        }

        if (isType<CommentAddedEvent>(event, createCommentAddedEvent)) {
          return this.commentAdded(event);
        }

        if (isType<CommentDeletedEvent>(event, createCommentDeletedEvent)) {
          return this.commentDeleted(event);
        }

        return Observable.empty<StreamingEvent<any>>();
      }, 3);
  }

  private async projectEdited(event: Event<ProjectEditedEvent>) {
    const payload = omitBy({
      id: event.payload.id,
      name: event.payload.name,
      description: event.payload.description,
      'repo-url': event.payload.repoUrl,
    }, isNil);
    return this.toSSE(event, payload);
  }

  private async activity(event: Event<MinardActivity>) {
    const apiActivity = await this.jsonApiPlugin.getJsonApiModule().toApiActivity(event.payload);
    const payload = this.jsonApiPlugin.serializeApiEntity('activity', apiActivity).data;
    return this.toSSE(event, payload);
  }

  private async codePushed(event: Event<CodePushedEvent>) {
    try {
      const projectId = event.payload.projectId;
      const commits = await Promise.all(event.payload.commits.map(async item => {
        const apiCommit = await this.getJsonApiModule().toApiCommit(projectId, item, []);
        return this.serializeApiEntity('commit', apiCommit).data;
      }));

      const branch = event.payload.after ?
        (await this.jsonApiPlugin.getEntity('branch', api => api.getBranch(projectId, event.payload.ref))).data :
        toApiBranchId(projectId, event.payload.ref);

      const payload: StreamingCodePushedEvent = {
        teamId: event.payload.teamId,
        commits,
        after: event.payload.after ? toApiCommitId(projectId, event.payload.after.id) : undefined,
        before: event.payload.before ? toApiCommitId(projectId, event.payload.before.id) : undefined,
        parents: event.payload.parents.map(item => toApiCommitId(projectId, item.id)),
        branch,
        project: String(projectId),
      };
      return this.toSSE(event, payload);

    } catch (error) {
      this.logger.error(`Unable to create StreamingCodePushedEvent`, { error, event });
      throw Error('Unable to create StreamingCodePushedEvent');
    }
  }

  private getJsonApiModule() {
    return this.jsonApiPlugin.getJsonApiModule();
  }

  private serializeApiEntity(type: string, entity: ApiEntity) {
    return this.jsonApiPlugin.serializeApiEntity(type, entity);
  }

  private async commentAdded(event: Event<CommentAddedEvent>) {
    const comment = await this.getJsonApiModule().toApiComment(event.payload);
    const payload = this.serializeApiEntity('comment', comment).data;
    return this.toSSE(event, payload);
  }

  private async commentDeleted(event: Event<CommentDeletedEvent>) {
    const payload: StreamingCommentDeletedEvent = {
      comment: String(event.payload.commentId),
      teamId: event.payload.teamId,
      deployment: toApiDeploymentId(event.payload.projectId, event.payload.deploymentId),
    };
    return this.toSSE(event, payload);
  }

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload: ApiProject = await this.jsonApiPlugin
      .getEntity('project', api => api.getProject(event.payload.id));
    return this.toSSE(event, payload);
  }

  private async deployment(event: Event<DeploymentEvent>) {
    try {
      const deployment = event.payload.deployment;
      const apiResponse = await this.jsonApiPlugin.getEntity(
        'deployment', api => api.toApiDeployment(deployment.projectId, deployment));

      const ssePayload: StreamingDeploymentEvent = {
        teamId: event.payload.teamId,
        branch: toApiBranchId(deployment.projectId, deployment.ref),
        project: String(deployment.projectId),
        commit: toApiCommitId(deployment.projectId, deployment.commitHash),
        deployment: apiResponse.data,
      };
      return this.toSSE(event, ssePayload);
    } catch (error) {
      const msg = 'Could not convert DeploymentEvent to streaming event';
      this.logger.error(msg, { error, event });
      throw Error(msg);
    }
  }

  private toSSE<T>(event: Event<any>, payload: T): StreamingEvent<T> {
    if (typeof event.teamId !== 'number' && typeof (payload as any).teamId !== 'number') {
      throw Error('Tried to convert an incompatible event to an SSEEvent');
    }

    const type = `SSE_${event.type}`;
    return eventCreator<any>(type, (_event: Event<any>) => {
      if (event.teamId) {
        _event.teamId = event.teamId!;
      }
      return true;
    })(payload) as StreamingEvent<T>;
  }
}

export function pingEventCreator(): PersistedEvent<any> {
  return {
    type: 'CONTROL_PING',
    id: '0',
    streamRevision: 0,
    teamId: 0,
    created: moment(),
    payload: 0,
  };
}

export function deploymentEventFilter(teamId: number, projectId: number, deploymentId: number) {
  return (event: PersistedEvent<any>) => {
    switch (event.type.replace(/^SSE_/, '')) {
      case COMMENT_ADDED_EVENT_TYPE:
        return event.teamId === teamId &&
          event.payload.attributes.deployment === `${projectId}-${deploymentId}`;
      case COMMENT_DELETED_EVENT_TYPE:
        return event.teamId === teamId &&
          event.payload.deployment === `${projectId}-${deploymentId}`;
    }
    return false;
  };
}
