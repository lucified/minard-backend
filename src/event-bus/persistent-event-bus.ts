import { Subject, Subscription } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';

import { Event, isSSE } from '../shared/events';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import EventStore from './event-store';
import { default as LocalEventBus } from './local-event-bus';
export const eventStoreConfigInjectSymbol = Symbol('event-store-config');

type Command = () => Promise<Event<any>>;

@injectable()
export class PersistentEventBus extends LocalEventBus {
  private eventStore: EventStore;
  private readonly queue: Subject<Command>;
  private readonly queueSubscription: Subscription;

  constructor(
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(eventStoreConfigInjectSymbol) eventStoreConfig: any,
    debug = false,
  ) {
    super();
    this.queue = new Subject<Command>();
    this.eventStore = new EventStore(
      this.publish.bind(this),
      eventStoreConfig,
      logger,
    );
    if (debug) {
      this.queueSubscription = this.subscribeWithTiming();
    } else {
      this.queueSubscription = this.queue
        .flatMap(job => job(), 1)
        .subscribe();
    }
  }

  private publish(event: Event<any>, callback: (err?: any) => void) {
    try {
      this.subject.next(event);
      this.logger.debug(`Published ${event.type}`);
      callback();
    } catch (error) {
      this.logger.error(error.message);
      callback(error);
    }
  }

  public post(event: Event<any>) {
    this.queue.next(() => this._post(event));
  }

  private async _post(event: Event<any>) {
    if (!isSSE(event)) { // only persist SSE events
      this.subject.next(event);
      return event;
    }
    await this.eventStore.persistEvent(event);
    return event;
  }

  public getEvents(teamId: number, since: number = 0) {
    return this.eventStore.getEvents(teamId, since);
  }

  private subscribeWithTiming() {
    return this.queue
      .flatMap(async job => {
        const start = Date.now();
        this.logger.debug('Starting job');
        const event = await job();
        this.logger.debug('Finished job');
        const duration = Date.now() - start;
        return { event, duration };
      }, 1)
      .timeInterval()
      .do(executedJob => {
        const { event, duration } = executedJob.value;
        const interval = executedJob.interval;
        this.logger.debug('%sms %sms %s', duration, interval, event.type);
      })
      .subscribe();
  }
}
