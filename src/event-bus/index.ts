import { Observable } from '@reactivex/rxjs';

import { Event } from '../shared/events';

export { default as LocalEventBus } from './local-event-bus';
export { PersistentEventBus, eventStoreConfigInjectSymbol } from './persistent-event-bus';

export type Event<T> = Event<T>;

export const eventBusInjectSymbol = Symbol('event-bus');

export interface EventBus {
  post(event: Event<any>): void;
  getStream(): Observable<Event<any>>;
  filterEvents<T>(...types: string[]): Observable<Event<T>>;
}
