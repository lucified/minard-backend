import { Observable } from '@reactivex/rxjs';
import { expect } from 'chai';
import * as moment from 'moment';
import { createClient } from 'redis';
import 'reflect-metadata';
import { promisify } from 'util';

import { eventCreator, isPersistedEvent, PersistedEvent } from '../shared/events';
import { default as logger } from '../shared/logger';
import { PersistentEventBus as EventBus } from './persistent-event-bus';

// Events boilerplate includes payload types, string identifiers and smart constructors
interface Payload {
  readonly status: 'bar';
  readonly foo?: string;
  readonly teamId?: number;
  readonly projectId?: number;
  readonly arr?: string[];
}
interface AnotherPayload {
  readonly status: 'foo';
  readonly bar: string;
}

const SSE_EVENT_TYPE = 'SSE_EVENT_TYPE';
const sseEventCreator = eventCreator<Payload>(SSE_EVENT_TYPE);

const TEST_EVENT_TYPE = 'TEST_EVENT_TYPE';
const testEventCreator = eventCreator<Payload>(TEST_EVENT_TYPE);

const ANOTHER_TEST_EVENT_TYPE = 'ANOTHER_TEST_EVENT_TYPE';
const anotherTestEventCreator = eventCreator<AnotherPayload>(ANOTHER_TEST_EVENT_TYPE);

let persistence: any = { type: 'inmemory' };

if (process.env.TEST_USE_REDIS) {
  persistence = {
    type: 'redis',
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || '16379',
    db: 0,
    prefix: 'charles-testing',
    eventsCollectionName: 'events',
    snapshotsCollectionName: 'snapshots',
  };
}

function getEventBus() {
  return  new EventBus(logger(undefined, false, true), persistence);
}

async function clearDb() {
  if (persistence.type === 'redis') {
    // we need to clear the db manually, otherwise nothing will work
    const client = createClient(persistence);
    const flushdb = client.flushdb.bind(client) as any;
    const quit = client.quit.bind(client) as any;
    const flushdbAsync = promisify(flushdb);
    const quitAsync = promisify(quit);
    await flushdbAsync();
    await quitAsync();
  }
}

describe('persistent-event-bus', () => {

  beforeEach(clearDb);

  // afterEach(clearDb);

  it('should work with an event that doesn\'t have teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(testEventCreator({ status: 'bar' }));
    const events = await promise;
    expect(events.length).to.eq(1);
    expect(events[0].type).to.equal(TEST_EVENT_TYPE);
    expect(events[0].type).to.equal(testEventCreator.type); // the constructor has a reference to the type
  });

  it('should work with an sse event that has teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 23234 }));
    const events = await promise;
    expect(events.length).to.eq(1);
    expect(events[0].type).to.equal(SSE_EVENT_TYPE);
    expect(events[0].type).to.equal(sseEventCreator.type); // the constructor has a reference to the type
  });

  it('should work with an sse event that has an empty array', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 23234, arr: [] }));
    const events = await promise;
    expect(events.length).to.eq(1);
    expect(events[0].type).to.equal(SSE_EVENT_TYPE);
    expect(events[0].type).to.equal(sseEventCreator.type); // the constructor has a reference to the type
    expect(events[0].payload.arr).to.have.length(0);
  });

  it('should add id and streamRevision to an sse event', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .map(event => <PersistedEvent<any>> event)
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 23234 }));
    const events = await promise;
    expect(events.length).to.eq(1);
    expect(events[0].id).to.exist;
    expect(events[0].streamRevision).to.eql(0);
  });

  it('should add a streamRevision that increments when using the same teamId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .map(event => <PersistedEvent<any>> event)
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 23234 }));
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId: 23234 }));
    const events = await promise;
    expect(events.length).to.eq(2);
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].payload.foo).to.eql('baz');
    expect(events[1].streamRevision).to.eql(1);
  });

  it('should add a streamRevision that increments when using the same teamId but separate projectId', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .map(event => <PersistedEvent<any>> event)
      .takeUntil(Observable.timer(100))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 23234, projectId: 34534 }));
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId: 23234, projectId: 2 }));
    const events = await promise;
    expect(events.length).to.eq(2);
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].payload.foo).to.eql('baz');
    expect(events[1].streamRevision).to.eql(1);
  });

  it('should add a streamRevision that doesn\'t increment when using separate teamIds', async () => {
    const bus = getEventBus();
    const promise = bus
      .getStream()
      .map(event => <PersistedEvent<any>> event)
      .takeUntil(Observable.timer(200))
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId: 2 }));
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId: 23234 }));
    const events = await promise;
    expect(events.length).to.eq(2);
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].payload.foo).to.eql('baz');
    expect(events[1].streamRevision).to.eql(0);
  });

  it('allows fetching by teamId', async () => {
    const bus = getEventBus();
    const teamId = 33423;

    const promise = bus
      .getStream()
      .take(3)
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId }));
    bus.post(testEventCreator({ status: 'bar', foo: 'foo', teamId }));
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId }));

    await promise;
    const events = await bus.getEvents(teamId);
    if (!events) {
      return expect.fail('Unexpected error');
    }
    expect(events.length).to.eql(2);
    expect(events[0].streamRevision).to.eql(0);
    expect(events[1].streamRevision).to.eql(1);
    expect(events[1].payload.foo).to.eql('baz');
  });

  it('allows fetching by teamId and since', async () => {
    const bus = getEventBus();
    const teamId = 33423;

    const promise = bus
      .getStream()
      .take(3)
      .toArray()
      .toPromise();

    bus.post(sseEventCreator({ status: 'bar', teamId }));
    bus.post(testEventCreator({ status: 'bar', foo: 'foo', teamId }));
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId, arr: [] }));

    await promise;
    const events = await bus.getEvents(teamId, 1);
    if (!events) {
      return expect.fail('Unexpected error');
    }
    expect(events.length).to.eql(1);
    expect(events[0].streamRevision).to.eql(1);
    expect(events[0].payload.foo).to.eql('baz');
    expect(events[0].payload.arr).to.have.length(0);
  });

  it('increments streamRevision correctly', async () => {
    const bus = getEventBus();
    const teamId = 33423;
    const since = 2;
    const numPersisted = 5;
    const finalNumber = numPersisted - since + 1;
    // Arrange

    const persistedPromise = bus.getStream()
      .take(numPersisted)
      .toArray()
      .toPromise();

    // Persist some events
    for (let i = 0; i < numPersisted; i++) {
      bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId }));
    }

    const persisted = await persistedPromise;
    expect(persisted.length).to.eq(numPersisted);
    const existing = await bus.getEvents(teamId, since);
    if (!existing) {
      return expect.fail('Unexpected error');
    }
    expect(existing.length).to.eq(numPersisted - since);
    const realTime = bus.getStream().filter(isPersistedEvent)
      .map(event => <PersistedEvent<any>> event);
    const combined = Observable.concat(Observable.from(existing), realTime);

    const promise = combined
      .take(finalNumber)
      .toArray()
      .toPromise();

    // This one is realtime
    bus.post(sseEventCreator({ status: 'bar', foo: 'baz', teamId }));

    const events = await promise;

    expect(events.length).to.eql(finalNumber);

    for (let i = 0; i < finalNumber; i++) {
      expect(events[i].streamRevision).to.eql(since + i);
    }

  });

  it('should allow filtering by types', async () => {
    const bus = getEventBus();
    const promise = bus
      .filterEvents<Payload>(TEST_EVENT_TYPE)
      .take(1)
      .toPromise();

    bus.post({ type: 'fooType', payload: { foo: 'bar' }, created: moment() });
    bus.post(testEventCreator({ status: 'bar' }));
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
