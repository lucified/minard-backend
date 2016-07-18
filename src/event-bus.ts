
import { Subject, Observer } from '@reactivex/rxjs';

export interface Event {
  type: string
}

export default class EventBus extends Subject<Event> {

  constructor() {
    super();
  }

  post(event : Event) {
    this.next(event);
  }

}
