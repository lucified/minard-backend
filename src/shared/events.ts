
export interface Event<T> {
  readonly type: string;
  readonly payload: T;
}

export interface EventCreator<T> {
  readonly type: string;
  (payload: T): Event<T>;
}

// Creates a constructor function that carries the type string in the type property
export const eventCreator = <T>(type: string): EventCreator<T> =>
  Object.assign(
    (payload: T): any => ({type, payload}),
    {type}
  );

export const isType = <T>(event: Event<any>, creator: EventCreator<T>):
  event is Event<T> => event.type === creator.type;
