
import { Observable } from '@reactivex/rxjs';
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

import { EventBus, eventBusInjectSymbol } from '../event-bus/';
import { Event, isType } from '../shared/events';

@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private jsonApiPlugin: JsonApiHapiPlugin;
  private eventBus: EventBus;
  public readonly stream: Observable<Event<any>>;

  private readonly logger: logger.Logger;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {

    this.eventBus = eventBus;
    this.logger = logger;
    this.jsonApiPlugin = jsonApiPlugin;
    this.stream = this.transform(eventBus).share();

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'realtime-plugin',
        version: '1.0.0',
      },
    });

  }

  private transform(bus: EventBus): Observable<any> {
    return bus.getStream().flatMap(event => {
      if (isType<ProjectCreatedEvent>(event, projectCreated)) {
        return this.projectCreated(event);
      }
      return Observable.of(event);
    }, 1);
  }

  private swapPayload<T>(event: Event<any>, payload: T): Event<T> {
    return {
      type: event.type,
      created: event.created,
      payload,
    };
  }

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload: ApiProject = await this.jsonApiPlugin
      .getEntity('project', api => api.getProject(event.payload.projectId));
    return this.swapPayload(event, payload);
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

  private postHandler(request: Hapi.Request, reply: Hapi.IReply) {
    this.eventBus.post(request.payload);
    reply(200);
  }

  private requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      // TODO const teamId = request.paramsArray[0];
      const stream = new ObservableWrapper(this.stream);
      reply(stream)
        .header('content-type', 'text/event-stream')
        .header('content-encoding', 'identity');

      request.once('disconnect', () => {
        // Clean up on disconnect
        stream.push(null);
      });

    } catch (err) {
      this.logger.error('Error handling a SSE request', err);
    }
  }

}
