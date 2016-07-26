
import { Event } from './event-bus';
import { injectable } from 'inversify';

import { Subject } from '@reactivex/rxjs';

@injectable()
export default class LocalEventBus extends Subject<Event> {

  constructor() {
    super();
  }

  public post(event: Event) {
    this.next(event);
  }
}
