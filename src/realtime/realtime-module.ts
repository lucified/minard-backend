
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as moment from 'moment';

import * as logger from '../shared/logger';
import { MINARD_ERROR_CODE } from '../shared/minard-error';

import {
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project/types';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';


@injectable()
export default class RealtimeModule {

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
  }



}
