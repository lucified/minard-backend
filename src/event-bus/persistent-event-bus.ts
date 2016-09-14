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
    this.eventStore.defineEventMappings({
      id: 'id',
      streamRevision: 'streamRevision',
    });
  }

  private _publish(event: Event<any>, callback: (err?: any) => void) {
    // this.logger.debug('Publishing %s', event.type);
    this.stream.next(event);
    callback();
  }

  public async post(event: Event<any>) {
    if (!event.teamId) {
      this.stream.next(event);
      return false;
    }
    try {
      if (!this.isEventStoreReady) {
        await this.eventStore.init();
      }
      const stream = await this.eventStore.getLastEventAsStream({
        aggregateId: event.teamId,
      });
      stream.addEvent(event);
      await stream.commit();
      return true;
    } catch (err) {
      this.logger.error('Unable to post event', err);
    }

    return false;
  }

  public async getEvents(teamId: string, since: number = 0): Promise<Event<any>[]> {
    const stream = await this.eventStore.getEventStream(teamId, since, -1);
    if (!stream) {
      throw new Error(`No event\'s for team ${teamId}`);
    }
    if (!stream.events) {
      return [];
    }
    const events = stream.events as Event<any>[];
    return events.map((event: any, i: number) => {
      event.payload.streamRevision = since + i;
      return event.payload;
    });
  }

}

function promisifyEventStore(eventStore: any) {
  eventStore.init = promisify(eventStore.init, eventStore);
  eventStore.getLastEventAsStream = promisify(eventStore.getLastEventAsStream, eventStore);
  eventStore.getEventStream = promisify(eventStore.getEventStream, eventStore);
  eventStore.commit = promisify(eventStore.commit, eventStore);
  return eventStore;
}
