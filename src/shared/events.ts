import * as moment from 'moment';

export interface EventPayload {}

export interface Event<T extends EventPayload> {
  readonly type: string;
  readonly created: moment.Moment;
  readonly payload: T;
  teamId?: number;
}

export interface StreamingEvent<T extends EventPayload> extends Event<T> {
  teamId: number;
}

// We only persist StreamingEvents
export interface PersistedEvent<T extends EventPayload> extends StreamingEvent<
  T
> {
  id: string;
  streamRevision: number;
}

export interface EventCreator<T extends EventPayload> {
  readonly type: string;
  (payload: T, callback?: (event: Event<T>) => Event<T>): Event<T>;
}

function copyIds(event: Event<any>) {
  if (typeof event.payload.teamId === 'number') {
    event.teamId = event.payload.teamId;
  }
}

// Creates a constructor function that carries the type string in the type property
export const eventCreator = <T extends EventPayload>(
  type: string,
  callback?: (event: Event<T>) => boolean,
): EventCreator<T> => {
  const ret = (payload: T) => {
    const event = {
      type,
      payload,
      created: moment(),
    };
    let doDefault = true;
    if (callback) {
      // The callback can modify the event in place
      doDefault = callback(event);
    }
    if (doDefault) {
      copyIds(event);
    }
    return event;
  };
  (ret as any).type = type;
  return ret as EventCreator<T>;
};

export function isType<T>(
  event: Event<any>,
  creator: EventCreator<T>,
): event is Event<T> {
  return event.type === creator.type;
}

export function isEventType<T>(
  event: Event<any>,
  type: string,
): event is Event<T> {
  return event.type === type;
}

export function isSSE<T>(event: Event<T>): event is StreamingEvent<T> {
  return event.type.substr(0, 4) === 'SSE_' && typeof event.teamId === 'number';
}

export function isPersistedEvent<T>(
  event: Event<T>,
): event is PersistedEvent<T> {
  return (
    isSSE(event) &&
    typeof (event as any).id === 'string' &&
    typeof (event as any).streamRevision === 'number'
  );
}
