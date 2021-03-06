import { caching } from 'cache-manager';
import { expect } from 'chai';
import 'reflect-metadata';

import { Cache } from '../shared/cache';
import CachedProjectModule from './cached-project-module';

describe('cached-project-module', () => {
  function setupCache(): Cache {
    return (caching({
      store: 'memory',
      ttl: 1000,
    }) as {}) as Cache;
  }

  function getProjectModule(cache: Cache) {
    return new CachedProjectModule(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      '',
      cache,
    );
  }

  describe('getProjectContributors', () => {
    const projectId = 5;

    it('first fetch should not come from cache', async () => {
      const cache = setupCache();
      const projectModule = getProjectModule(cache);
      projectModule._getProjectContributors = async (_projectId: number) => {
        expect(_projectId).to.equal(projectId);
        return [{}, {}] as any;
      };
      const contributors = await projectModule.getProjectContributors(
        projectId,
      );
      expect(contributors).to.exist;
      expect(contributors).to.have.length(2);
    });

    it('second fetch should come from cache', async () => {
      const cache = setupCache();
      const projectModule = getProjectModule(cache);
      let callCount = 0;
      projectModule._getProjectContributors = async (_projectId: number) => {
        expect(callCount).to.equal(0);
        expect(_projectId).to.equal(projectId);
        callCount++;
        return [{}, {}] as any;
      };
      await projectModule.getProjectContributors(projectId);
      const contributors = await projectModule.getProjectContributors(
        projectId,
      );
      expect(contributors).to.exist;
      expect(contributors).to.have.length(2);
    });

    it('second fetch should not come from cache for different projectId', async () => {
      const cache = setupCache();
      const projectModule = getProjectModule(cache);
      projectModule._getProjectContributors = async (_projectId: number) => {
        if (_projectId === projectId) {
          return [{}, {}] as any;
        }
        return [{}, {}, {}];
      };
      const contributors = await projectModule.getProjectContributors(
        projectId,
      );
      const contributors2 = await projectModule.getProjectContributors(9);

      expect(contributors).to.exist;
      expect(contributors).to.have.length(2);
      expect(contributors2).to.exist;
      expect(contributors2).to.have.length(3);
    });

    it('second fetch should not come from cache after code is pushed', async () => {
      const cache = setupCache();
      const projectModule = getProjectModule(cache);
      let callCount = 0;
      projectModule._getProjectContributors = async (_projectId: number) => {
        callCount++;
        if (callCount === 1) {
          return [{}, {}] as any;
        }
        return [{}, {}, {}];
      };
      projectModule._handlePushEvent = async (
        _projectId: number,
        _ref: string,
        _payload: any,
      ) => undefined;
      const contributors = await projectModule.getProjectContributors(
        projectId,
      );
      await projectModule.handlePushEvent(projectId, 'foo', {} as any);
      const contributors2 = await projectModule.getProjectContributors(
        projectId,
      );

      expect(contributors).to.exist;
      expect(contributors).to.have.length(2);
      expect(contributors2).to.exist;
      expect(contributors2).to.have.length(3);
    });
  });
});
