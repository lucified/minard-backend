
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

import { PersistentEventBus, eventBusInjectSymbol } from '../event-bus/';
import { Event, isType } from '../shared/events';

@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private jsonApiPlugin: JsonApiHapiPlugin;
  private eventBus: PersistentEventBus;
  public readonly stream: Observable<Event<any>>;

  private readonly logger: logger.Logger;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(eventBusInjectSymbol) eventBus: PersistentEventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {

    this.eventBus = eventBus;
    this.logger = logger;
    this.jsonApiPlugin = jsonApiPlugin;
    this.stream = this.eventBus.getStream().share();

    this.register = Object.assign(this._register.bind(this), {
      attributes: {
        name: 'realtime-plugin',
        version: '1.0.0',
      },
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

  private postHandler(request: Hapi.Request, reply: Hapi.IReply) {
    this.eventBus.post(request.payload);
    reply(200);
  }

  private async requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const teamId = request.paramsArray[0];

      const sinceKey = 'last-event-id';
      let observable = this.stream;
      if (request.headers[sinceKey]) {
        const since =  parseInt(request.headers[sinceKey], 10);
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

}
