
import { Observable, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';
import { Readable } from 'stream';

import * as Hapi from 'hapi';
import * as Joi from 'joi';

import { JsonApiHapiPlugin } from '../json-api';
import { HapiRegister } from '../server/hapi-register';
import * as logger from '../shared/logger';

import {
  ProjectCreatedEvent,
  projectCreated,
} from '../project';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';
import { Event, isType } from '../shared/events';

@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');
  private jsonApiPlugin: JsonApiHapiPlugin;
  private authenticationModule: AuthenticationModule;
  private eventBus: EventBus;
  private stream: Observable<Event<any>>;

  private readonly logger: logger.Logger;

  constructor(
    @inject(JsonApiHapiPlugin.injectSymbol) jsonApiPlugin: JsonApiHapiPlugin,
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.authenticationModule = authenticationModule;
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
    return bus.flatMap(event => {
      console.log(event.type);
      if (isType<ProjectCreatedEvent>(event, projectCreated)) {
        return this.projectCreated(event);
      }
      return Observable.of(event);
    }, 1);
  }

  private richify<T>(event: Event<any>, payload: T): Event<T> {
    return {
      type: event.type,
      created: event.created,
      payload,
    };
  }

  private async projectCreated(event: Event<ProjectCreatedEvent>) {
    const payload = await this.jsonApiPlugin.getEntity('project', api => api.getProject(event.payload.projectId));
    return this.richify(event, payload);
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
      console.log(err);
    }
  }

}

class ObservableWrapper extends Readable {
  private readonly stream: Observable<Event<any>>;
  private subscription: Subscription;

  constructor(stream: Observable<Event<any>>) {
    super();
    this.stream = stream;

    this.on('end', () => this.subscription && this.subscription.unsubscribe());
    this.on('error', (err: any) => console.log(err));
  }

  private sseEvent(event: Event<any>) {
    return this.stringifyEvent({
      id: 1,
      event: event.type,
      data: event.payload,
    });
  }

  private subscribe() {
    if (!this.subscription) {
      // Every time there's data, push it into the internal buffer.
      this.subscription = this.stream
        .map(this.sseEvent.bind(this))
        .subscribe(
          event => this.push(event),
          error => { throw error; },
          () => this.push(null)
        );
    }
  }
  // _read will be called when the stream wants to pull more data in
  // the advisory size argument is ignored in this case.
  public _read(size: any) {
    this.subscribe();
  }

  // https://github.com/mtharrison/susie/blob/master/lib/utils.js
  private stringifyEvent(event: any) {
    let str = '';
    const endl = '\r\n';
    for (const i in event) {
      if (event.hasOwnProperty(i)) {
        let val = event[i];
        if (val instanceof Buffer) {
          val = val.toString();
        }
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        str += i + ': ' + val + endl;
      }
    }
    str += endl;

    return str;
  }
}
