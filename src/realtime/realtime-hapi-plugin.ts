
import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';
import { omitBy, isNil } from 'lodash';
import * as moment from 'moment';

import * as Joi from 'joi';

import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import * as logger from '../shared/logger';
import { ObservableWrapper } from './observable-wrapper';

import {
  ApiEntity,
  toApiBranchId,
  toApiCommitId,
  toApiDeploymentId,
} from '../json-api';

import {
  createDeploymentEvent,
  DeploymentEvent,
} from '../deployment';

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

import {
  createActivityEvent,
  MinardActivity,
} from '../activity';

import {
  StreamingCodePushedEvent,
  StreamingCommentDeletedEvent,
  StreamingDeploymentEvent,
} from './types';

import {
  CommentAddedEvent,
  CommentDeletedEvent,
  createCommentAddedEvent,
  createCommentDeletedEvent,
} from '../comment';

import { eventBusInjectSymbol, PersistentEventBus } from '../event-bus/';

import {
  Event,
  eventCreator,
  isPersistedEvent,
  isType,
  PersistedEvent,
  StreamingEvent,
} from '../shared/events';

export const PING_INTERVAL = 20000;

@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private jsonApiPlugin: JsonApiHapiPlugin;
  private eventBus: PersistentEventBus;
  private eventBusSubscription: Subscription;
  public readonly persistedEvents: Observable<PersistedEvent<any>>;
  private readonly logger: logger.Logger;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) eventBus: PersistentEventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {

    this.eventBus = eventBus;
    this.logger = logger;
    this.jsonApiPlugin = jsonApiPlugin;
    this.persistedEvents = this.eventBus.getStream()
      .filter(isPersistedEvent)
      .map(event => <PersistedEvent<any>> event)
      .share();

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'realtime-plugin',
        version: '1.0.0',
      },
    });

    // creates SSEEvents and posts them
    this.eventBusSubscription = this.getEnrichedStream()
      .subscribe(this.eventBus.post.bind(this.eventBus));
  }

  private getEnrichedStream(): Observable<StreamingEvent<any>> {
    return this.enrich(this.eventBus.getStream())
      .catch(err => {
        this.logger.error('Error on enrich:', err);
        return this.getEnrichedStream();
      });
  }

  private _register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {

    server.route({
      method: 'GET',
      path: '/events/{teamId}',
      handler: {
        async: this.requestHandler,
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

    // Used for testing, should be removed in production
    server.route({
      method: 'POST',
      path: '/events/{teamId}',
      handler: {
        async: this.postHandler,
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

    next();

  }

  public readonly register: HapiRegister;

  private async postHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const isPersisted = await this.eventBus.post(request.payload);
      reply(JSON.stringify(request.payload, null, 2))
        .code(isPersisted ? 500 : 200);

    } catch (err) {
      this.logger.error('Error:', err);
      reply(err);
    }
  }

  private pingEvent() {
    return {
      type: 'CONTROL_PING',
      id: '0',
      streamRevision: 0,
      teamId: 0,
      created: moment(),
      payload: 0,
    } as PersistedEvent<any>;
  }

  private async onRequest(teamId: number, since?: number) {
      let observable = Observable.concat(
        Observable.of(this.pingEvent()),
        this.persistedEvents.filter(event => event.teamId === teamId),
      );
      if (since) {
        const existing = await this.eventBus.getEvents(teamId, since);
        if (existing.length > 0) {
          existing.shift(); // getEvents is '>= since', but here we want '> since'
        }
        observable = Observable.concat(Observable.from(existing), observable);
      }
      observable = Observable.merge(
        Observable.interval(PING_INTERVAL).map(_ => this.pingEvent()),
        observable,
      );
      return observable;

  }

  private async requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.paramsArray[0], 10);
      const sinceKey = 'last-event-id';
      const since = request.headers[sinceKey];
      const observable = await this.onRequest(teamId, since ? parseInt(since, 10) : undefined );
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
    if (typeof event.teamId !== 'number' && typeof (<any> payload).teamId !== 'number') {
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
