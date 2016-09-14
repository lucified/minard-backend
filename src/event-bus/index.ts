
import { Observable, Subscription } from '@reactivex/rxjs';

import { Event } from '../shared/events';

export { default as LocalEventBus } from './local-event-bus';
export { default as PersistentEventBus } from './persistent-event-bus';

export type Subscription = Subscription;
export type Event<T> = Event<T>;

export const eventBusInjectSymbol = Symbol('event-bus');
export const eventStoreConfigInjectSymbol = Symbol('event-store-config');

export interface EventBus {
  post(event: Event<any>): Promise<boolean>;
  getStream(): Observable<Event<any>>;
  filterEvents<T>(...types: string[]): Observable<Event<T>>;
}
