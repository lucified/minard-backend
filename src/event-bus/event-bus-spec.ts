
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { eventCreator } from '../shared/events';
import EventBus from './local-event-bus';

// Events boilerplate includes payload types, string identifiers and smart constructors
interface Payload {
  readonly status: 'bar';
  readonly foo?: string;
  readonly teamId?: string;
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
  it('created event has timestamp', () => {
    const testEvent = testEventCreator({ status: 'bar', foo: 'foo' });
    expect(testEvent.created).to.exist;
  });
  it('created event has teamId if payload has teamId', () => {
    let testEvent = testEventCreator({ status: 'bar', foo: 'foo' });
    expect(testEvent.teamId).to.not.exist;
    const teamId = 'baz';
    testEvent = testEventCreator({ status: 'bar', foo: 'foo', teamId });
    expect(testEvent.teamId).to.equal(teamId);
  });

});

describe('event-bus', () => {

  it('should work with single event', async () => {
    const bus = new EventBus();
    const promise = bus
      .getStream()
      .take(1)
      .toPromise();

    const success = await bus.post(testEventCreator({ status: 'bar' }));
    const event = await promise;
    expect(success).to.be.true;
    expect(event.type).to.equal(TEST_EVENT_TYPE);
    expect(event.type).to.equal(testEventCreator.type); // the constructor has a reference to the type
  });

  it('should allow filtering by types', async () => {
    const bus = new EventBus();
    const promise = bus
      .filterEvents<Payload>(TEST_EVENT_TYPE)
      .take(1)
      .toPromise();

    await bus.post({ type: 'fooType', payload: { foo: 'bar' }, created: moment() });
    await bus.post(testEventCreator({ status: 'bar' }));
    const event = await promise;

    expect(event.type).to.equal(TEST_EVENT_TYPE);
    expect(event.payload.status).to.equal('bar');


  });

  it('should allow filtering by multiple types', async () => {
    const bus = new EventBus();
    let counter = 0;
    const promise = bus
      .filterEvents<Payload | AnotherPayload>(TEST_EVENT_TYPE, ANOTHER_TEST_EVENT_TYPE)
      .take(2)
      .toArray()
      .toPromise();

    const testEvent = testEventCreator({ status: 'bar', foo: 'foo' });
    const anotherTestEvent = anotherTestEventCreator({ status: 'foo', bar: 'bar' });

    await Promise.all([bus.post(testEvent), bus.post(anotherTestEvent)]);
    const events = await promise;

    events.forEach(event => {
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
    });
    expect(counter).to.eq(2);

  });

});
