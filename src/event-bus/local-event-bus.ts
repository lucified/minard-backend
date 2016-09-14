import { Observable, Subject  } from '@reactivex/rxjs';
import { injectable } from 'inversify';

import { Event } from '../shared/events';
import { EventBus } from './';


@injectable()
export default class LocalEventBus implements EventBus {

  protected readonly stream: Subject<Event<any>>;

  constructor() {
    this.stream = new Subject<Event<any>>();
  }

  public async post(event: Event<any>) {
    this.stream.next(event);
    return true;
  }

  public getStream(): Observable<Event<any>> {
    return this.stream;
  }

  /**
   * Filters the observable to only contain events e, whose e.type is any of the strings
   * given by the arguments. When giving multiple arguments, the type T should be a discriminated union type.
   */
  public filterEvents<T>(...types: string[]): Observable<Event<T>> {
    return this.stream.filter(e => types.indexOf(e.type) >= 0)
      .map(e => e as Event<T>);
  }

}
