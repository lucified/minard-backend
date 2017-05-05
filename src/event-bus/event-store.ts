import { Event, PersistedEvent } from '../shared/events';
import { Logger } from '../shared/logger';
import { promisify } from '../shared/promisify';
import { sleep } from '../shared/sleep';

const eventStoreConstructor = require('eventstore');

export interface EventStoreEvent<T> {
  streamId: string;
  aggregateId: string;
  aggregate: any;
  context: any;
  streamRevision: number;
  commitId: string;
  commitSequence: number;
  commitStamp: Date;
  payload: T;
  id: string;
  restInCommitStream: number;
}

export interface EventStoreStream<T> {
  streamId: string;
  aggregateId: string;
  aggregate: any;
  context: any;
  events: EventStoreEvent<T>[];
  id: string;
  lastRevision: number;
}

export default class EventStore {

  private isConnected = false;
  private eventStore: any;

  constructor(
    private readonly publisher: (event: Event<any>, cb: (err: any) => void) => void,
    private readonly eventStoreConfig: any,
    private readonly logger: Logger,
    private readonly numRetries = 1,
    private readonly sleepFor = 300,
  ) { }

  public async persistEvent(event: Event<any>) {
    for (let i = 0; i < this.numRetries + 1; i++) {
      const persisted = await this.tryPersistEvent(event);
      if (persisted === true) {
        return true;
      }
      if (i < this.numRetries) {
        await sleep(this.sleepFor);
      }
    }
    this.logger.error('Unable to persist event %s even after %d retries', event.type, this.numRetries);
    return false;
  }

  private async tryPersistEvent(event: Event<any>) {
    try {
      await this.connect();
      const stream = await this.eventStore.getLastEventAsStream({
        aggregateId: String(event.teamId),
      });
      stream.addEvent(event);
      await this.eventStore.commit(stream);
      return true;
    } catch (err) {
      this.logger.info('Unable to persist event %s', event.type, err);
      this.isConnected = false;
      return false;
    }
  }

  public async getEvents(teamId: number, since: number = 0): Promise<PersistedEvent<any>[] | false> {
    for (let i = 0; i < this.numRetries + 1; i++) {
      const stream = await this.tryGetStream(teamId, since);
      if (stream) {
        return stream.map((event: any, j: number) => {
          event.payload.streamRevision = since + j;
          return event.payload;
        });
      }
      if (i < this.numRetries) {
        await sleep(this.sleepFor);
      }
    }
    return false;
  }

  private async tryGetStream(
    teamId: number,
    since: number = 0,
  ): Promise<EventStoreEvent<PersistedEvent<any>>[] | false> {
    try {
      await this.connect();
      this.logger.debug('Trying to get event stream for team %s', teamId);
      const stream: EventStoreStream<PersistedEvent<any>> =
        await this.eventStore.getEventStream(String(teamId), since, -1);
      this.logger.debug('Found %d events', stream && stream.events && stream.events.length || 0);
      return (stream && stream.events) || [];
    } catch (error) {
      this.isConnected = false;
      this.logger.error('Unable to get event stream for team %s', teamId, error);
      return false;
    }
  }

  private async connect(): Promise<void> {
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
  }
}

function promisifyEventStore(eventStore: any) {
  eventStore.init = promisify(eventStore.init, eventStore);
  eventStore.getLastEventAsStream = promisify(eventStore.getLastEventAsStream, eventStore);
  eventStore.getEventStream = promisify(eventStore.getEventStream, eventStore);
  eventStore.commit = promisify(eventStore.commit, eventStore);
  return eventStore;
}
