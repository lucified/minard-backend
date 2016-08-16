
import * as moment from 'moment';

export interface Event<T> {
  readonly type: string;
  readonly created: moment.Moment;
  readonly payload: T;
}

export interface EventCreator<T> {
  readonly type: string;
  (payload: T): Event<T>;
}

// Creates a constructor function that carries the type string in the type property
export const eventCreator = <T>(type: string): EventCreator<T> => {
  const ret: (payload: T) => Event<T> = (payload: T) => {
    return {
      type,
      payload,
      created: moment(),
    };
  };
  (<any> ret).type = type;
  return ret as EventCreator<T>;
};

export const isType = <T>(event: Event<any>, creator: EventCreator<T>):
  event is Event<T> => event.type === creator.type;
