
import { Observable, Subscription } from '@reactivex/rxjs';

import { Event } from '../shared/events';

export {default as LocalEventBus} from './local-event-bus';

export type Subscription = Subscription;
export type Event<T> = Event<T>;

export const injectSymbol = Symbol('event-bus');

export interface EventBus extends Observable<Event<any>> {
  post(event: Event<any>): void;
  filterEvents<T>(...types: string[]): Observable<Event<T>>;
}
