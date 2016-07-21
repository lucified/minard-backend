
import EventBus from '../src/event-bus';
import { expect } from 'chai';

describe('event-bus', () => {

  it('should work with single event', done => {
    const bus = new EventBus();
    bus
      .subscribe((event: any) => {
        expect(event.type).to.equal('test-event');
        done();
      });
    const event = {
      type: 'test-event',
    };
    bus.post(event);
  });

});

