import { Observable, Subject } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';

import { Event, PersistedEvent, isSSE } from '../shared/events';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { default as LocalEventBus } from './local-event-bus';

import { promisify } from '../shared/promisify';

const eventStoreConstructor = require('eventstore');
export const eventStoreConfigInjectSymbol = Symbol('event-store-config');

interface Job {
  type: string;
  execute: () => Promise<any>;
}

@injectable()
export class PersistentEventBus extends LocalEventBus {

  private isEventStoreReady = false;
  private eventStore: any;
  private logger: Logger;
  private readonly pipe: Subject<Job>;

  constructor(
    @inject(loggerInjectSymbol) logger: Logger,
    @inject(eventStoreConfigInjectSymbol) eventStoreConfig?: any) {
    super();
    this.logger = logger;
    this.pipe = new Subject<Job>();
    this.eventStore = promisifyEventStore(eventStoreConstructor(eventStoreConfig));
    this.eventStore.useEventPublisher(this._publish.bind(this));
    this.eventStore.defineEventMappings({
      id: 'id',
      streamRevision: 'streamRevision',
    });
    this.subscribeToPipe();
  }

  private prependInit(pipe: Subject<Job>) {
    return Observable.concat(
      Observable.of({ type: 'INIT', execute: () => this.ensureInit() }),
      pipe
    );
  }

  private subscribeToPipe() {
    let stream: any;
    if (process.env.DEBUG) {
      stream = this.prependInit(this.pipe)
        .flatMap(async job => {
          const start = Date.now();
          const result = await job.execute();
          const duration = Date.now() - start;
          return { job, result, duration };
        }, 1)
        .timeInterval()
        .do(_executedJob => {
          const executedJob = _executedJob as any;
          const result = executedJob.value.result;
          const interval = executedJob.interval;
          const duration = executedJob.value.duration;
          const jobType = executedJob.value.job.type;

          const event = result && result.type ? result.type : '';
          this.logger.debug('%sms %sms %s %s', duration, interval, jobType, event);
        });
    } else {
      stream = this.prependInit(this.pipe).flatMap(job => job.execute(), 1);
    }
    stream.subscribe();
  }

  private _publish(event: Event<any>, callback: (err?: any) => void) {
    this.subject.next(event);
    callback();
  }

  public post(event: Event<any>) {
    this.pipe.next({ type: 'POST', execute: () => this._post(event) });
  }

  private async _post(event: Event<any>) {
    if (!isSSE(event)) { // only persist SSE events
      this.subject.next(event);
      return event;
    }

    try {
      const stream = await this.eventStore.getLastEventAsStream({
        aggregateId: String(event.teamId),
      });
      stream.addEvent(event);
      await this.eventStore.commit(stream);
      return event;
    } catch (err) {
      this.logger.error('Unable to post event', err);
      throw err;
    }
  }

  public async getEvents(teamId: number, since: number = 0): Promise<PersistedEvent<any>[]> {
    await this.ensureInit();
    const stream = await this.eventStore.getEventStream(String(teamId), since, -1);
    if (!stream) {
      throw new Error(`No event\'s for team ${teamId}`);
    }
    if (!stream.events) {
      return [];
    }
    const events = stream.events as PersistedEvent<any>[];
    return events.map((event: any, i: number) => {
      event.payload.streamRevision = since + i;
      return event.payload;
    });
  }

  private async ensureInit(): Promise<boolean> {
    if (!this.isEventStoreReady) {
      await this.eventStore.init();
      this.isEventStoreReady = true;
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
