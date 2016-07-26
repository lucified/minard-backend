
require('isomorphic-fetch');

import AuthenticationModule from '../authentication/authentication-module';
import SystemHooksModule from './system-hook-module';

const fetchMock = require('fetch-mock');
import { expect } from 'chai';


describe('system-hooks-module', () => {

  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return 'the-token';
    }
  }

  it('getSystemHooks', async () => {
    const authenticationModule = new MockAuthModule() as AuthenticationModule;
    const systemHooksModule = new SystemHooksModule(authenticationModule, fetch);

    const listHooksResponse = [
      {
        'id' : 1,
        'url' : 'https://gitlab.example.com/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      },
    ];
    fetchMock.restore().mock('http://fake-gitlab.com:1000/api/v3/hooks?private_token=the-token',
      listHooksResponse, { method: 'GET' });

    const hooks = await systemHooksModule.getSystemHooks();
    expect(hooks).to.have.length(1);
    expect(hooks[0].id).to.equal(1);
    expect(hooks[0].url).to.equal('https://gitlab.example.com/hook');
  });


  it('hasSystemHook', async () => {
    const authenticationModule = new MockAuthModule() as AuthenticationModule;
    const systemHooksModule = new SystemHooksModule(authenticationModule, fetch);

    // positive case
    fetchMock.restore().mock('http://fake-gitlab.com:1000/api/v3/hooks?private_token=the-token',
      [{
        'id' : 1,
        'url' : 'http://fake-internal-url.com/project/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      }],
      {
        method: 'GET',
      });
    expect(await systemHooksModule.hasSystemHookRegistered(
      'http://fake-internal-url.com/project/hook')).to.equal(true);

    // negative case
    fetchMock.restore().mock('http://fake-gitlab.com:1000/api/v3/hooks?private_token=the-token',
      [{
        'id' : 1,
        'url' : 'https://wrong-internal-url.com/project/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      }],
      {
        method: 'GET',
      });
    expect(await systemHooksModule.hasSystemHookRegistered(
      'http://fake-internal-url.com/project/hook')).to.equal(false);
  });

  it('registerSystemHook', async () => {
    class MockUserModule {
      public async getRootAuthenticationToken() {
        return 'the-token';
      }
    }
    const authenticationModule = new MockAuthModule() as AuthenticationModule;
    const systemHooksModule = new SystemHooksModule(authenticationModule, fetch);

    fetchMock.restore().mock(
        'http://fake-gitlab.com:1000/api/v3/hooks?private_token=the-token' +
        '&url=http%3A%2F%2Ffake-internal-url.com%2Fproject%2Fhook',
      {
        'status': 200,
      },
      {
        method: 'POST',
      });
    expect(await systemHooksModule.registerSystemHook(
      'http://fake-internal-url.com/project/hook')).to.equal(true);
    expect(fetchMock.called()).to.equal(true);
  });


});
