import { expect } from 'chai';
import 'reflect-metadata';

import { ServiceRegistrator } from './dns-register';
import { fetchMock } from './fetch';
import { default as loggerConstructor } from './logger';



function getRegistrator(locatorUrl: string) {
  return new ServiceRegistrator(locatorUrl, fetchMock.fetchMock, loggerConstructor(undefined, true), 20);
};

describe('ServiceRegistrator', () => {

  it('should not try if locatorUrl is empty', async () => {
    let called = 0;
    fetchMock.restore().mock('*', (url: any, options: any) => {called++; return 200; }, {method: 'PUT'});
    await getRegistrator('').register('foo');
    expect(called).to.eq(0);
  });

  it('should retry if unable to connect', async () => {
    let called = 0;
    const locatorUrl = 'http://locator';
    fetchMock.restore().mock(`^${locatorUrl}/`,  (url: any, options: any) => {called++; return 404; }, {method: 'PUT'});
    await getRegistrator(locatorUrl).register('foo');
    expect(called).to.be.greaterThan(1);
  });

});
