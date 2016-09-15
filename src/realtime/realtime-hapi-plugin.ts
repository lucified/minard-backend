
import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';

import * as Hapi from 'hapi';
import * as Joi from 'joi';

import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import { HapiRegister } from '../server/hapi-register';
import * as logger from '../shared/logger';
import { ObservableWrapper } from './observable-wrapper';

import {
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectEditedEvent,
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

import { PersistentEventBus, eventBusInjectSymbol } from '../event-bus/';
import { Event, SSEEvent, isSSE, isType } from '../shared/events';

@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private jsonApiPlugin: JsonApiHapiPlugin;
  private eventBus: PersistentEventBus;
  private eventBusSubscription: Subscription;
  public readonly sseEvents: Observable<SSEEvent<any>>;

  private readonly logger: logger.Logger;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) eventBus: PersistentEventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {

    this.eventBus = eventBus;
    this.logger = logger;
    this.jsonApiPlugin = jsonApiPlugin;
    this.sseEvents = this.eventBus.getStream()
      .filter(isSSE)
      .map(event => <SSEEvent<any>> event)
      .share();

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'realtime-plugin',
        version: '1.0.0',
      },
    });

    // creates SSEEvents and posts them
    this.eventBusSubscription = this.getEnrichedStream()
      .flatMap(async (enriched) => {
        try {
          return await this.eventBus.post(enriched);
        } catch (err) {
          this.logger.error('Error when trying to post enriched event %s', enriched.type, err);
        }
        return Observable.empty<boolean>();
      })
      .subscribe();
  }

  private getEnrichedStream(): Observable<Event<any>> {
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

  private async requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = parseInt(request.paramsArray[0], 10);
      const sinceKey = 'last-event-id';
      let observable = this.sseEvents.filter(event => event.teamId === teamId);
      if (request.headers[sinceKey]) {
        const since = parseInt(request.headers[sinceKey], 10);
        const existing = await this.eventBus.getEvents(teamId, since);
        observable = Observable.concat(Observable.from(existing), observable);
      }
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

  private enrich(stream: Observable<Event<any>>) {
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
        return Observable.empty<Event<any>>();
      }, 3);
  }

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload: ApiProject = await this.jsonApiPlugin
      .getEntity('project', api => api.getProject(event.payload.projectId));
    return this.toSSE(event, payload);
  }

  private toSSE<T>(event: Event<any>, payload: T): Event<T> {
    if (!event.teamId) {
      throw Error('Tried to convert an incompatible event to an SSEEvent');
    }
    return Object.assign({}, event, {
      type: 'SSE_' + event.type,
      payload,
    });
  }

}
