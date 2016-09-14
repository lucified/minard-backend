
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { eventCreator } from '../shared/events';
import { default as logger } from '../shared/logger';
import EventBus from './persistent-event-bus';

// Events boilerplate includes payload types, string identifiers and smart constructors
interface Payload {
  readonly status: 'bar';
  readonly foo?: string;
  readonly teamId?: string;
  readonly projectId?: string;
}
interface AnotherPayload {
  readonly status: 'foo';
  readonly bar: string;
}
const TEST_EVENT_TYPE = 'TEST_EVENT_TYPE';
const testEventCreator = eventCreator<Payload>(TEST_EVENT_TYPE);

const ANOTHER_TEST_EVENT_TYPE = 'ANOTHER_TEST_EVENT_TYPE';
const anotherTestEventCreator = eventCreator<AnotherPayload>(ANOTHER_TEST_EVENT_TYPE);

function getEventBus() {
  return new EventBus(logger(undefined, false, true));
}

describe('persistent-event-bus', () => {

  it('should work with an event that doesn\'t have teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(1)
      .toPromise();

    const isPersisted = await bus.post(testEventCreator({ status: 'bar' }));
    const event = await promise;
    expect(isPersisted).to.be.false;
    expect(event.type).to.equal(TEST_EVENT_TYPE);
    expect(event.type).to.equal(testEventCreator.type); // the constructor has a reference to the type
  });

  it('should work with an event that has teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(1)
      .toPromise();

    const isPersisted = await bus.post(testEventCreator({ status: 'bar', teamId: 'foo' }));
    const event = await promise;
    expect(isPersisted).to.be.true;
    expect(event.type).to.equal(TEST_EVENT_TYPE);
    expect(event.type).to.equal(testEventCreator.type); // the constructor has a reference to the type
  });

  it('should add id and streamRevision when to an event when persisted', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(1)
      .toPromise();

    await bus.post(testEventCreator({ status: 'bar', teamId: 'foo' }));
    const event = await promise;
    expect(event.id).to.be.exist;
    expect(event.streamRevision).to.eql(0);
   });

  it('should add a streamRevision that increments when using the same teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(2)
      .toArray()
      .toPromise();

    await bus.post(testEventCreator({ status: 'bar', teamId: 'foo' }));
    await bus.post(testEventCreator({ status: 'bar', foo: 'baz', teamId: 'foo' }));
    const events = await promise;
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].streamRevision).to.eql(1);
   });

  it('should add a streamRevision that increments when using the same teamId but separate projectId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(2)
      .toArray()
      .toPromise();

    await bus.post(testEventCreator({ status: 'bar', teamId: 'foo', projectId: 'foo' }));
    await bus.post(testEventCreator({ status: 'bar', foo: 'baz', teamId: 'foo', projectId: 'bar' }));
    const events = await promise;
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].streamRevision).to.eql(1);
   });

  it('should add a streamRevision that doesn\'t increment when using separate teamIds', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .take(2)
      .toArray()
      .toPromise();

    await bus.post(testEventCreator({ status: 'bar', teamId: 'fooo' }));
    await bus.post(testEventCreator({ status: 'bar', foo: 'baz', teamId: 'foo' }));
    const events = await promise;
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].streamRevision).to.eql(0);
   });

  it('allows fetching by teamId', async () => {
    const bus = getEventBus();
    const teamId = 'foo';

    const promises = [
      bus.post(testEventCreator({ status: 'bar', teamId })),
      bus.post(testEventCreator({ status: 'bar', foo: 'baz', teamId })),
    ];
    await Promise.all(promises);

    const events = await bus.getEvents(teamId);
    expect(events.length).to.eql(2);
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].streamRevision).to.eql(1);
    expect(events[1].payload.foo).to.eql('baz');

   });

  it('allows fetching by teamId and since', async () => {
    const bus = getEventBus();
    const teamId = 'foo';

    const promises = [
      bus.post(testEventCreator({ status: 'bar', teamId })),
      bus.post(testEventCreator({ status: 'bar', foo: 'baz', teamId })),
    ];
    await Promise.all(promises);

    const events = await bus.getEvents(teamId, 1);
    expect(events.length).to.eql(1);
    expect(events[0].streamRevision).to.eql(1);
    expect(events[0].payload.foo).to.eql('baz');

   });


  it('should allow filtering by types', async () => {
    const bus = getEventBus();
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
    const bus = getEventBus();
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
