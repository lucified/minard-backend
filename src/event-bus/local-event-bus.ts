import { Observable, Subject } from '@reactivex/rxjs';
import { injectable } from 'inversify';

import { Event } from '../shared/events';
import { EventBus } from './';

@injectable()
export default class LocalEventBus implements EventBus {
  protected readonly stream: Observable<Event<any>>;
  protected readonly subject: Subject<Event<any>>;

  constructor() {
    this.subject = new Subject<Event<any>>();
    this.stream = this.handledSubject();
  }

  private handledSubject(): Observable<Event<any>> {
    return this.subject.catch(err => this.handleError(err));
  }

  private handleError(err?: any): Observable<Event<any>> {
    if (err) {
      console.error(err);
    }
    return this.handledSubject();
  }

  public post(event: Event<any>) {
    if (this.subject.isStopped) {
      throw new Error(
        'eventBus has stopped running, which should never happen.',
      );
    }
    this.subject.next(event);
  }

  public getStream(): Observable<Event<any>> {
    if (this.subject.isStopped) {
      throw new Error(
        'eventBus has stopped running, which should never happen.',
      );
    }
    return this.stream;
  }

  /**
   * Filters the observable to only contain events e, whose e.type is any of the strings
   * given by the arguments. When giving multiple arguments, the type T should be a discriminated union type.
   */
  public filterEvents<T>(...types: string[]): Observable<Event<T>> {
    return this.getStream()
      .filter(e => types.indexOf(e.type) >= 0)
      .map(e => e as Event<T>);
  }
}
