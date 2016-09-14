import { inject, injectable } from 'inversify';

import { Event } from '../shared/events';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { LocalEventBus, eventStoreConfigInjectSymbol } from './';

import { promisify } from '../shared/promisify';

const eventStoreConstructor = require('eventstore');

@injectable()
export default class PersistentEventBus extends LocalEventBus  {

  private isEventStoreReady = false;
  private eventStore: any;
  private logger: Logger;

  constructor(
    @inject(loggerInjectSymbol) logger: Logger) {
    super();
    this.logger = logger;
    this.eventStore = promisifyEventStore(eventStoreConstructor());
    this.eventStore.useEventPublisher(this._publish.bind(this));
  }

  private _publish(event: Event<any>, callback: (err?: any) => void) {
    this.logger.debug('Publishing %s', event.type);
    this.stream.next(event);
    callback();
  }

  public async post(event: Event<any>) {
    if (!event.teamId) {
      this.logger.debug('No teamId on %s', event.type);
      this.stream.next(event);
      return false;
    }
    try {
      if (!this.isEventStoreReady) {
        await this.eventStore.init();
      }
      const stream = await this.eventStore.getLastEventAsStream({
        aggregateId: event.teamId,
        context: event.teamId,
      });
      stream.addEvent(event);
      await stream.commit();
      return true;
    } catch (err) {
      this.logger.error('Unable to post event', err);
    }

    return false;
  }

}

function promisifyEventStore(eventStore: any) {
  eventStore.init = promisify(eventStore.init, eventStore);
  eventStore.getLastEventAsStream = promisify(eventStore.getLastEventAsStream, eventStore);
  eventStore.commit = promisify(eventStore.commit, eventStore);
  return eventStore;
}
