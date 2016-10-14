import { expect } from 'chai';
import 'reflect-metadata';

import { fetchMock } from './fetch';
import { default as loggerConstructor } from './logger';
import { Route53Updater, Route53UpdaterFunction } from './route53-updater';

const retryDelay = 1;
const maxRetries = 5;
const logger = loggerConstructor(undefined, true);

function getRoute53UpdaterFunction(callback: () => void): Route53UpdaterFunction {
  return async (values: {Value: string}[], hostedZoneId: string, name: string, type: string, ttl: number) => {
    return callback();
  };
}
function getRegistrator(callback: () => void) {
  const func = getRoute53UpdaterFunction(callback);
  return new Route53Updater(fetchMock.fetchMock, logger, retryDelay, retryDelay, maxRetries, func);
};

describe('Route53Updater', () => {

  it('should not try to update if baseUrl is empty', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (url: any, options: any) => { return '1.2.3.4'; }, {method: 'GET'});
    const result = await getRegistrator(() => called++)
      .update('', 'bar');
    expect(called).to.eq(0);
    expect(result).to.be.false;
  });

  it('should retry if unable to connect', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (url: any, options: any) => { return '1.2.3.4'; }, {method: 'GET'});
    const result = await getRegistrator(() => {
      called++;
      throw new Error('Unable to connect');
    }).update('foo', 'bar');
    expect(called).to.eq(maxRetries);
    expect(result).to.be.false;
  });

  it('should return true on success', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (url: any, options: any) => { return '1.2.3.4'; }, {method: 'GET'});
    const result = await getRegistrator(() => {
      called++;
      return {ChangeInfo: {Status: 'PENDING'}};
    }).update('foo', 'bar');
    expect(called).to.eq(1);
    expect(result).to.be.true;
  });

});
