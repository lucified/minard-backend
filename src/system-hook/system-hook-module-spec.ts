
require('isomorphic-fetch');

import SystemHookModule from './system-hook-module';
import { GitlabClient } from '../shared/gitlab-client'
import { IFetchStatic } from '../shared/fetch.d.ts';

const fetchMock = require('fetch-mock');
import { expect } from 'chai';


describe('system-hooks-module', () => {

  function getGitlabClient() {
    return new GitlabClient(
      'http://fake-gitlab.com:1000',
      fetchMock.fetchMock as IFetchStatic);
  }

  function getSystemHooksModule(gitlabClient: GitlabClient) {
    return new SystemHookModule(gitlabClient, 'http://fake-internal-url.com/');
  }

  it('getSystemHooks', async () => {
    // arrange
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient);
    const listHooksResponse = [
      {
        'id' : 1,
        'url' : 'https://gitlab.example.com/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      },
    ];
    fetchMock.restore().mock(`http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
      listHooksResponse, { method: 'GET' });

    // act
    const hooks = await systemHookModule.getSystemHooks();

    // assert
    expect(hooks).to.have.length(1);
    expect(hooks[0].id).to.equal(1);
    expect(hooks[0].url).to.equal('https://gitlab.example.com/hook');
  });

  it('hasSystemHookPositiveCase', async () => {
    // arrange
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient);
    fetchMock.restore().mock(`http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
      [{
        'id' : 1,
        'url' : 'http://fake-internal-url.com/project/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      }],
      {
        method: 'GET',
      });

    // act
    const hasHook = await systemHookModule.hasSystemHookRegistered('/project/hook');

    // assert
    expect(hasHook).to.equal(true);
  });

  it('hasSystemHookPositiveCase', async () => {
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient);
    fetchMock.restore().mock(`http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
      [{
        'id' : 1,
        'url' : 'https://wrong-internal-url.com/project/hook',
        'created_at' : '2015-11-04T20:07:35.874Z',
      }],
      {
        method: 'GET',
    });

    // act
    const hasHook = await systemHookModule.hasSystemHookRegistered('/project/hook');

    // assert
    expect(hasHook).to.equal(false);
  });

  it('registerSystemHook', async () => {
    // arrange
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient);
    const mockUrl = `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks` +
        '?url=http%3A%2F%2Ffake-internal-url.com%2Fproject%2Fhook';
    fetchMock.restore().mock(mockUrl, {
      'status': 200,
    },
    {
      method: 'POST',
    });

    // act
    const success = await systemHookModule.registerSystemHook('/project/hook');

    // assert
    expect(success).to.equal(true);
    expect(fetchMock.called()).to.equal(true);
  });

});
