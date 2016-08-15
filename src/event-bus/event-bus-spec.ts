
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { eventCreator } from '../shared/events';
import EventBus from './local-event-bus';

// Events boilerplate includes payload types, string identifiers and smart constructors
interface Payload {
  readonly status: 'bar';
  readonly foo?: string;
}
interface AnotherPayload {
  readonly status: 'foo';
  readonly bar: string;
}
const TEST_EVENT_TYPE = 'TEST_EVENT_TYPE';
const testEventCreator = eventCreator<Payload>(TEST_EVENT_TYPE);

const ANOTHER_TEST_EVENT_TYPE = 'ANOTHER_TEST_EVENT_TYPE';
const anotherTestEventCreator = eventCreator<AnotherPayload>(ANOTHER_TEST_EVENT_TYPE);

describe('event-creator', () => {
  it('creates events with expected type', () => {
    const testEvent = testEventCreator({ status: 'bar', foo: 'foo' });
    expect(testEvent.type).to.equal(TEST_EVENT_TYPE);
  });
});

describe('event-bus', () => {

  it('should work with single event', done => {
    const bus = new EventBus();
    bus
      .subscribe(event => {
        expect(event.type).to.equal(TEST_EVENT_TYPE);
        expect(event.type).to.equal(testEventCreator.type); // the constructor has a reference to the type
      }, done, done);
    bus.post(testEventCreator({ status: 'bar' }));
    bus.complete();
  });

  it('should allow filtering by types', done => {
    const bus = new EventBus();
    bus
      .filterEvents<Payload>(TEST_EVENT_TYPE)
      .subscribe(event => {
        expect(event.type).to.equal(TEST_EVENT_TYPE);
        expect(event.payload.status).to.equal('bar');
      }, done, done);
    bus.post(testEventCreator({ status: 'bar' }));
    bus.post({ type: 'fooType', payload: { foo: 'bar' }, created: moment() });
    bus.complete();

  });

  it('should allow filtering by multiple types', (done) => {
    const bus = new EventBus();
    let counter = 0;
    bus
      .filterEvents<Payload | AnotherPayload>(TEST_EVENT_TYPE, ANOTHER_TEST_EVENT_TYPE)
      .subscribe(event => {
        const payload = event.payload;
        // Type narrowing
        switch (payload.status) {
          case 'bar':
            expect(event.type).to.equal(TEST_EVENT_TYPE);
            expect(payload.foo).to.equal('foo');

            break;
          case 'foo':
            expect(event.type).to.equal(ANOTHER_TEST_EVENT_TYPE);
            expect(payload.bar).to.equal('bar');

            break;

          default:
            throw new Error('Unknown type');
        }
        counter++;

      }, done, () => {
        expect(counter).to.eq(2);
        done();
      });
    const testEvent = testEventCreator({ status: 'bar', foo: 'foo' });
    const anotherTestEvent = anotherTestEventCreator({ status: 'foo', bar: 'bar' });

    bus.post(testEvent);
    bus.post(anotherTestEvent);
    bus.complete();

  });

});
