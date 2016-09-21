
import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';
import * as moment from 'moment';

import * as Hapi from 'hapi';
import * as Joi from 'joi';

import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import { HapiRegister } from '../server/hapi-register';
import * as logger from '../shared/logger';
import { ObservableWrapper } from './observable-wrapper';

import {
  toApiBranchId,
  toApiCommitId,
} from '../json-api';

import {
  CodePushedEvent,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectEditedEvent,
  codePushed,
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

import {
  MinardActivity,
  createActivityEvent,
} from '../activity';

import {
  StreamingCodePushedEvent,
} from './types';

import { PersistentEventBus, eventBusInjectSymbol } from '../event-bus/';

import {
  Event,
  PersistedEvent,
  StreamingEvent,
  eventCreator,
  isPersistedEvent,
  isType,
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
      handler: this.requestHandler.bind(this),
      config: {
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
      handler: this.postHandler.bind(this),
      config: {
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    });

    next();

  };

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
        this.persistedEvents.filter(event => event.teamId === teamId)
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
        observable
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
        if (
          isType<ProjectEditedEvent>(event, projectEdited) ||
          isType<ProjectDeletedEvent>(event, projectDeleted)) {
          return Observable.of(this.toSSE(event, event.payload));
        }

        if (isType<CodePushedEvent>(event, codePushed)) {
          return this.codePushed(event);
        }

        if (isType<MinardActivity>(event, createActivityEvent)) {
          return this.activity(event);
        }

        return Observable.empty<StreamingEvent<any>>();
      }, 3);
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
        const apiCommit = await this.jsonApiPlugin.getJsonApiModule().toApiCommit(projectId, item, []);
        return this.jsonApiPlugin.serializeApiEntity('commit', apiCommit).data;
      }));

      const branch = event.payload.after ?
        (await this.jsonApiPlugin.getEntity('branch', api => api.getBranch(projectId, event.payload.ref))).data :
        toApiBranchId(projectId, event.payload.ref);

      const payload: StreamingCodePushedEvent = {
        teamId: 1,
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

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload: ApiProject = await this.jsonApiPlugin
      .getEntity('project', api => api.getProject(event.payload.id));
    return this.toSSE(event, payload);
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
