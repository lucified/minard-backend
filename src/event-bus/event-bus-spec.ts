
import 'reflect-metadata';

import { eventCreator }  from '../shared/events';
import EventBus from './local-event-bus';
import { expect } from 'chai';

interface Payload {
  readonly foo: string;
}
const TEST_EVENT_TYPE = 'TEST_EVENT_TYPE';
const testEventCreator = eventCreator<Payload>(TEST_EVENT_TYPE);
const emptyEvent = testEventCreator({foo: 'bar'});

describe('event-creator', () => {
  it('creates events with expected type', () => {
    expect(emptyEvent.type).to.equal(TEST_EVENT_TYPE);
  });
});

describe('event-bus', () => {

  it('should work with single event', done => {
    const bus = new EventBus();
    bus
      .subscribe(event => {
        expect(event.type).to.equal(TEST_EVENT_TYPE);
      }, done, done);
    bus.post(testEventCreator({foo: 'bar'}));
    bus.complete();
  });

  it('should allow filtering by types', done => {
    const bus = new EventBus();
    bus
      .filterEvents<Payload>(TEST_EVENT_TYPE)
      .subscribe(event => {
        expect(event.type).to.equal(TEST_EVENT_TYPE);
        expect(event.payload.foo).to.equal('bar');
      }, done, done);
    bus.post(testEventCreator({foo: 'bar'}));
    bus.post({type: 'fooType', payload: {foo: 'bar'}});
    bus.complete();

  });
});
