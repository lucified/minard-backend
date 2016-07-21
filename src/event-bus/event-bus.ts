
import { Subject } from '@reactivex/rxjs';

export interface Event {
  type: string;
}

export default class EventBus extends Subject<Event> {

  constructor() {
    super();
  }

  public post(event: Event) {
    this.next(event);
  }

}
