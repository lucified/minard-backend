
import { expect } from 'chai';

export const expectIsNotNull = (obj: any | null): obj is string | number | boolean | Object | any[] => {
  expect(obj).to.exist;
  return !!obj;
};
