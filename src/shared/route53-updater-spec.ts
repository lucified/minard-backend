import { expect } from 'chai';
import 'reflect-metadata';

import { fetchMock } from './fetch';
import { default as loggerConstructor } from './logger';
import { ChangeInfo, Route53Updater, Route53UpdaterFunction } from './route53-updater';

const retryDelay = 1;
const maxRetries = 5;
const logger = loggerConstructor(undefined, true);

interface UpdaterResult {
  ChangeInfo: ChangeInfo;
};
function getRoute53UpdaterFunction(callback: () => UpdaterResult): Route53UpdaterFunction {
  return async (_values: {Value: string}[], _hostedZoneId: string, _name: string, _type: string, _ttl: number) => {
    return callback();
  };
}
function getRegistrator(callback: () => UpdaterResult) {
  const func = getRoute53UpdaterFunction(callback);
  return new Route53Updater(fetchMock.fetchMock, logger, retryDelay, retryDelay, maxRetries, func);
};

describe('Route53Updater', () => {

  it('should not try to update if baseUrl is empty', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (_url: any, _options: any) => '1.2.3.4', {method: 'GET'});
    const result = await getRegistrator(() => { called++; return {ChangeInfo: {Status: 'PENDING', Id: 'dsdfsdf'}}; })
      .update('', 'bar');
    expect(called).to.eq(0);
    expect(result).to.be.false;
  });

  it('should retry if unable to connect', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (_url: any, _options: any) => '1.2.3.4', {method: 'GET'});
    const result = await getRegistrator(() => {
      called++;
      throw new Error('Unable to connect');
    }).update('foo', 'bar');
    expect(called).to.eq(maxRetries);
    expect(result).to.be.false;
  });

  it('should return true on success', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (_url: any, _options: any) => '1.2.3.4', {method: 'GET'});
    const result = await getRegistrator(() => {
      called++;
      return {ChangeInfo: {Status: 'INSYNC', Id: 'dsdfsdf'}};
    }).update('foo', 'bar');
    expect(called).to.eq(1);
    expect(result).to.be.true;
  });

});
