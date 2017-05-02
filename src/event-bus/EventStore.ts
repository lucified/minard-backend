import { Event, PersistedEvent } from '../shared/events';
import { Logger } from '../shared/logger';
import { promisify } from '../shared/promisify';
import { sleep } from '../shared/sleep';

const eventStoreConstructor = require('eventstore');

export default class EventStore {

  private isConnected = false;
  private eventStore: any;

  constructor(
    private readonly publisher: (event: Event<any>, cb: (err: any) => void) => void,
    private readonly eventStoreConfig: any,
    private readonly logger: Logger,
    private readonly numRetries = 1,
    private readonly sleepFor = 300,
  ) {
  }

  public async persistEvent(event: Event<any>) {
    const tryPersistEvent = async () => {
      try {
        await this.connect();
        const stream = await this.eventStore.getLastEventAsStream({
          aggregateId: String(event.teamId),
        });
        stream.addEvent(event);
        await this.eventStore.commit(stream);
        return true;
      } catch (err) {
        this.logger.error('Unable to post event %s', event.type, err);
        this.isConnected = false;
        return false;
      }
    };
    for (let i = 0; i < this.numRetries + 1; i++) {
      const persisted = await tryPersistEvent();
      if (persisted === true) {
        return true;
      }
      if (i < this.numRetries) {
        await sleep(this.sleepFor);
      }
    }
    return false;
  }

  public async getEvents(teamId: number, since: number = 0): Promise<PersistedEvent<any>[] |  false> {
    const tryGetStream = async () => {
      try {
        await this.connect();
        this.logger.debug('Trying to get event stream for team %s', teamId);
        const stream = await this.eventStore.getEventStream(String(teamId), since, -1);
        this.logger.debug('Found %d events', stream && stream.events && stream.events.length || 0);
        return stream as { events: PersistedEvent<any>[] };
      } catch (error) {
        this.isConnected = false;
        this.logger.error('Unable to get event stream for team %s', teamId, error);
        return false;
      }
    };
    for (let i = 0; i < this.numRetries + 1; i++) {
      const stream = await tryGetStream();
      if (stream) {
        if (!stream.events) {
          return [];
        }
        return stream.events.map((event: any, j: number) => {
          event.payload.streamRevision = since + j;
          return event.payload;
        });
      }
      // Force reconnect
      if (i < this.numRetries) {
        await sleep(this.sleepFor);
      }
    }
    return false;
  }

  private async connect(): Promise<boolean> {
    if (!this.isConnected) {
      const eventStore = promisifyEventStore(eventStoreConstructor(this.eventStoreConfig));
      eventStore.useEventPublisher(this.publisher);
      eventStore.defineEventMappings({
        id: 'id',
        streamRevision: 'streamRevision',
      });
      await eventStore.init();
      this.eventStore = eventStore;
      this.isConnected = true;
      this.logger.info('Connected to persistence of type %s', this.eventStoreConfig.type);
    }
    return true;
  }
}

function promisifyEventStore(eventStore: any) {
  eventStore.init = promisify(eventStore.init, eventStore);
  eventStore.getLastEventAsStream = promisify(eventStore.getLastEventAsStream, eventStore);
  eventStore.getEventStream = promisify(eventStore.getEventStream, eventStore);
  eventStore.commit = promisify(eventStore.commit, eventStore);
  return eventStore;
}
