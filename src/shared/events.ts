
import * as moment from 'moment';

export interface EventPayload {
}

export interface Event<T extends EventPayload> {
  readonly type: string;
  readonly created: moment.Moment;
  readonly payload: T;
  teamId?: string;
}

export interface EventCreator<T extends EventPayload> {
  readonly type: string;
  (payload: T, callback?: (event: Event<T>) => Event<T>): Event<T>;
}

function copyIds(event: Event<any>) {
  if (event.payload.teamId) {
    event.teamId = event.payload.teamId;
  }
}

// Creates a constructor function that carries the type string in the type property
export const eventCreator =
  <T extends EventPayload>(type: string, callback?: (event: Event<T>) => boolean): EventCreator<T> => {
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
  (<any> ret).type = type;
  return ret as EventCreator<T>;
};

export const isType = <T>(event: Event<any>, creator: EventCreator<T>):
  event is Event<T> => event.type === creator.type;
