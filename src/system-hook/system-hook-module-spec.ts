import { expect } from 'chai';
import * as fetchMock from 'fetch-mock';
import 'reflect-metadata';

import Authentication from '../authentication/authentication-module';
import { EventBus, LocalEventBus } from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import SystemHookModule from './system-hook-module';
import {
  SYSTEM_HOOK_REGISTRATION_EVENT_TYPE,
  SystemHookRegistrationEvent,
} from './types';

const logger = Logger(undefined, true);

describe('system-hooks-module', () => {
  function getGitlabClient() {
    class MockAuthModule {
      public async getRootAuthenticationToken() {
        return 'dfgdfdfg';
      }
    }
    return new GitlabClient(
      'http://fake-gitlab.com:1000',
      'secret',
      (fetchMock as any).fetchMock,
      new MockAuthModule() as Authentication,
      {} as any,
    );
  }

  function getSystemHooksModule(gitlabClient: GitlabClient, bus: EventBus) {
    return new SystemHookModule(
      gitlabClient,
      'http://fake-internal-url.com/',
      bus,
      logger,
    );
  }

  it('getSystemHooks', async () => {
    // arrange
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient, {} as any);
    const listHooksResponse = [
      {
        id: 1,
        url: 'https://gitlab.example.com/hook',
        created_at: '2015-11-04T20:07:35.874Z',
      },
    ];
    fetchMock
      .restore()
      .mock(
        `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
        listHooksResponse,
        { method: 'GET' },
      );

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
    const systemHookModule = getSystemHooksModule(gitlabClient, {} as any);
    fetchMock
      .restore()
      .mock(
        `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
        [
          {
            id: 1,
            url: 'http://fake-internal-url.com/project/hook',
            created_at: '2015-11-04T20:07:35.874Z',
          },
        ],
        {
          method: 'GET',
        },
      );

    // act
    const hasHook = await systemHookModule.hasSystemHookRegistered(
      '/project/hook',
    );

    // assert
    expect(hasHook).to.equal(true);
  });

  it('hasSystemHookPositiveCase', async () => {
    const gitlabClient = getGitlabClient();
    const systemHookModule = getSystemHooksModule(gitlabClient, {} as any);
    fetchMock
      .restore()
      .mock(
        `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks`,
        [
          {
            id: 1,
            url: 'https://wrong-internal-url.com/project/hook',
            created_at: '2015-11-04T20:07:35.874Z',
          },
        ],
        {
          method: 'GET',
        },
      );

    // act
    const hasHook = await systemHookModule.hasSystemHookRegistered(
      '/project/hook',
    );

    // assert
    expect(hasHook).to.equal(false);
  });

  it('registerSystemHook', () => {
    it('successfully registers system hook and posts event', async () => {
      const bus = new LocalEventBus();

      // arrange
      const gitlabClient = getGitlabClient();
      const systemHookModule = getSystemHooksModule(gitlabClient, bus);
      const mockUrl =
        `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks` +
        '?url=http%3A%2F%2Ffake-internal-url.com%2Fproject%2Fhook';
      fetchMock.restore().mock(
        mockUrl,
        {
          status: 200,
        },
        {
          method: 'POST',
        },
      );

      let eventFired = true;
      bus
        .filterEvents<SystemHookRegistrationEvent>(
          SYSTEM_HOOK_REGISTRATION_EVENT_TYPE,
        )
        .subscribe(event => {
          expect(event.payload.status).to.equal('success');
          eventFired = true;
        });

      // act
      const success = await systemHookModule.registerSystemHook(
        '/project/hook',
      );

      // assert
      expect(success).to.equal(true);
      expect(fetchMock.called()).to.equal(true);
      expect(eventFired).to.equal(true);
    });

    it('reports failure event when registration fails', async () => {
      const bus = new LocalEventBus();

      // arrange
      const gitlabClient = getGitlabClient();
      const systemHookModule = getSystemHooksModule(gitlabClient, bus);
      const mockUrl =
        `http://fake-gitlab.com:1000${gitlabClient.apiPrefix}/hooks` +
        '?url=http%3A%2F%2Ffake-internal-url.com%2Fproject%2Fhook';
      fetchMock.restore().mock(
        mockUrl,
        {
          status: 500,
        },
        {
          method: 'POST',
        },
      );

      let eventFired = true;
      bus
        .filterEvents<SystemHookRegistrationEvent>(
          SYSTEM_HOOK_REGISTRATION_EVENT_TYPE,
        )
        .subscribe(event => {
          expect(event.payload.status).to.equal('failed');
          eventFired = true;
        });

      // act
      const success = await systemHookModule.registerSystemHook(
        '/project/hook',
      );

      // assert
      expect(success).to.equal(false);
      expect(fetchMock.called()).to.equal(true);
      expect(eventFired).to.equal(true);
    });
  });
});
