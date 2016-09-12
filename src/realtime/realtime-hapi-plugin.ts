
import { inject, injectable } from 'inversify';

import * as Hapi from 'hapi';

import { HapiRegister } from '../server/hapi-register';
import * as logger from '../shared/logger';
import { MINARD_ERROR_CODE } from '../shared/minard-error';

import {
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project/types';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';

import { PassThrough } from 'stream';


@injectable()
export class RealtimeHapiPlugin {

  public static injectSymbol = Symbol('realtime-module');

  private authenticationModule: AuthenticationModule;
  private eventBus: EventBus;
  private readonly logger: logger.Logger;

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.authenticationModule = authenticationModule;
    this.eventBus = eventBus;
    this.logger = logger;

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
    });

    next();
  };

  public readonly register: HapiRegister;

  private requestHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const id = request.paramsArray[0];

    } catch (err) {
      console.log(err);
    }
  }


}
