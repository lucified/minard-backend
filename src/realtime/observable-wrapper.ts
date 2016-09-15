import { Observable, Subscription } from '@reactivex/rxjs';
import { Readable } from 'stream';

import { PersistedEvent } from '../shared/events';

export class ObservableWrapper extends Readable {
  private readonly stream: Observable<PersistedEvent<any>>;
  private subscription: Subscription;

  // http://hapijs.com/api#replyerr-result
  // Note that if result is a Stream with a statusCode property,
  // that status code will be used as the default response code.
  public readonly statusCode = 200;

  constructor(stream: Observable<PersistedEvent<any>>) {
    super();
    this.stream = stream;

    this.on('end', () => this.subscription && this.subscription.unsubscribe());
    this.on('error', (err: any) => { throw err; });
  }

  private sseEvent(event: PersistedEvent<any>) {
    return this.stringifyEvent({
      id: event.streamRevision,
      event: event.type,
      data: event.payload,
    });
  }

  private subscribe() {
    if (!this.subscription) {
      // Every time there's data, push it into the internal buffer.
      this.subscription = this.stream
        .map(this.sseEvent.bind(this))
        .subscribe(
          event => this.push(event),
          error => { throw error; },
          () => this.push(null)
        );
    }
  }
  // _read will be called when the stream wants to pull more data in
  // the advisory size argument is ignored in this case.
  public _read(size: any) {
    this.subscribe();
  }

  // https://github.com/mtharrison/susie/blob/master/lib/utils.js
  private stringifyEvent(event: any) {
    let str = '';
    const endl = '\r\n';
    for (const i in event) {
      if (event.hasOwnProperty(i)) {
        let val = event[i];
        if (val instanceof Buffer) {
          val = val.toString();
        }
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        str += i + ': ' + val + endl;
      }
    }
    str += endl;

    return str;
  }
}
