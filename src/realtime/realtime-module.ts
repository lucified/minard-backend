import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';
import { isNil, omitBy } from 'lodash';

import {
  createActivityEvent,
  MinardActivity,
} from '../activity';
import {
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
import {
  Event,
  eventCreator,
  isPersistedEvent,
  isType,
  PersistedEvent,
  StreamingEvent,
} from '../shared/events';
import * as logger from '../shared/logger';
import {
  StreamingCodePushedEvent,
  StreamingCommentDeletedEvent,
  StreamingDeploymentEvent,
} from './types';

@injectable()
export class RealtimeModule {

  public static injectSymbol = Symbol('realtime-module');
  private eventBusSubscription: Subscription;
  private readonly sseStream: Observable<PersistedEvent<any>>;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) private readonly jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) private readonly eventBus: PersistentEventBus,
    @inject(logger.loggerInjectSymbol) private readonly logger: logger.Logger,
  ) {

    // creates SSEEvents and posts them
    this.eventBusSubscription = this.getEnrichedStream(this.eventBus.getStream())
      .subscribe(this.eventBus.post.bind(this.eventBus));

    // listens to SSEEvents and shares them
    this.sseStream = this.eventBus.getStream()
      .filter(isPersistedEvent)
      .share();

  }

  public getSSEStream() {
    return this.sseStream;
  }

  public async getExistingEvents(teamId: number, lastEventId: number) {
    const existing = await this.eventBus.getEvents(teamId, lastEventId);
    if (existing.length > 0) {
      existing.shift(); // getEvents is '>= since', but here we want '> since'
    }
    return Observable.from(existing);
  }

  private getEnrichedStream(stream: Observable<Event<any>>): Observable<StreamingEvent<any>> {
    return this.enrich(stream)
      .catch(err => {
        this.logger.error('Error on enrich:', err);
        return this.getEnrichedStream(stream);
      });
  }

  private enrich(stream: Observable<Event<any>>): Observable<StreamingEvent<any>> {
    return stream
      .flatMap(event => {
        if (isType<ProjectCreatedEvent>(event, projectCreated)) {
          return this.projectCreated(event);
        }

        if (isType<ProjectDeletedEvent>(event, projectDeleted)) {
          return Observable.of(toSSE(event, event.payload));
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
    return toSSE(event, payload);
  }

  private async activity(event: Event<MinardActivity>) {
    const apiActivity = await this.jsonApiPlugin.getJsonApiModule().toApiActivity(event.payload);
    const payload = this.jsonApiPlugin.serializeApiEntity('activity', apiActivity).data;
    return toSSE(event, payload);
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
      return toSSE(event, payload);

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
    return toSSE(event, payload);
  }

  private async commentDeleted(event: Event<CommentDeletedEvent>) {
    const payload: StreamingCommentDeletedEvent = {
      comment: String(event.payload.commentId),
      teamId: event.payload.teamId,
      deployment: toApiDeploymentId(event.payload.projectId, event.payload.deploymentId),
    };
    return toSSE(event, payload);
  }

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload: ApiProject = await this.jsonApiPlugin
      .getEntity('project', api => api.getProject(event.payload.id));
    return toSSE(event, payload);
  }

  private async deployment(event: Event<DeploymentEvent>) {
    try {
      const deployment = event.payload.deployment;
      const apiResponse = await this.jsonApiPlugin.getEntity(
        'deployment', api => api.toApiDeployment(deployment.projectId, deployment),
      );

      const ssePayload: StreamingDeploymentEvent = {
        teamId: event.payload.teamId,
        branch: toApiBranchId(deployment.projectId, deployment.ref),
        project: String(deployment.projectId),
        commit: toApiCommitId(deployment.projectId, deployment.commitHash),
        deployment: apiResponse.data,
      };
      return toSSE(event, ssePayload);
    } catch (error) {
      const msg = 'Could not convert DeploymentEvent to streaming event';
      this.logger.error(msg, { error, event });
      throw Error(msg);
    }
  }
}

export function toSSE<T>(event: Event<any>, payload: T): StreamingEvent<T> {
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
