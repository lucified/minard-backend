
import { Subject } from '@reactivex/rxjs';
import { injectable } from 'inversify';

@injectable()
export abstract class EventBus extends Subject<Event> {
  public static injectSymbol = Symbol('event-bus');
  public abstract post(event: Event): void;
}

export interface Event {
  type: string;
}
