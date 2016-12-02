
import { expect } from 'chai';
import 'reflect-metadata';

import {
  MinardCommit,
} from '../shared/minard-commit';

import {
  MinardBranch,
  MinardProject,
} from '../project/';

import {
  ApiProject,
  JsonApiModule,
  memoizeApi,
} from './';

describe('memoized-json-api-module', () => {
  describe('toApiProject', () => {
    class MockInternalJsonApi extends JsonApiModule {
      public constructor() {
        super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      }
      public async toApiProject(project: MinardProject) {
        return {
          id: project.id,
        };
      }
    }
    it('should return memoized copy when passed an identical object', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
      const ret2 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
      expect(ret1).to.equal(ret2);
    });

    it('should return memoized copy when passed an object that has same id', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
      const ret2 = await api.toApiProject( { id: 1, name: 'bar' } as MinardProject );
      expect(ret1).to.equal(ret2);
    });

    it('should not return memoized copy passed an object with different id', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
      const ret2 = await api.toApiProject( { id: 2, name: 'foo' } as MinardProject );
      expect(ret1).to.not.equal(ret2);
    });
  });
  describe('toApiBranch', () => {
    class MockInternalJsonApi extends JsonApiModule {
      public constructor() {
        super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      }
      public async toApiBranch(project: ApiProject, branch: MinardBranch) {
        return {
          id: 'foo',
        };
      }
    }
    it('should return memoized copy when passed an identical object as parameters', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiBranch(
        { id: '1', name: 'foo' } as {} as ApiProject,
        { name: 'foo' } as MinardBranch);
      const ret2 = await api.toApiBranch(
        { id: '1', name: 'foo' } as {} as ApiProject,
        { name: 'foo' } as MinardBranch);
      expect(ret1).to.equal(ret2);
    });

    it('should not return memoized copy when project has different id', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiBranch(
        { id: '1', name: 'foo' } as {} as ApiProject,
        { name: 'foo' } as MinardBranch);
      const ret2 = await api.toApiBranch(
        { id: '2', name: 'foo' } as {} as ApiProject,
        { name: 'foo' } as MinardBranch);
      expect(ret1).to.not.equal(ret2);
    });

    it('should not return memoized copy when branch has different name', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiBranch(
        { id: '1', name: 'foo' } as {} as ApiProject,
        { name: 'foo' } as MinardBranch);
      const ret2 = await api.toApiBranch(
        { id: '1', name: 'foo' } as {} as ApiProject,
        { name: 'bar' } as MinardBranch);
      expect(ret1).to.not.equal(ret2);
    });
  });

  describe('toApiCommit', () => {
    class MockInternalJsonApi extends JsonApiModule {
      public constructor() {
        super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      }
      public async toApiCommit(projectId: number, commit: MinardCommit) {
        return {
          id: 'foo',
        };
      }
    }
    it('should return memoized copy when passed same project id and identical commit object', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
      const ret2 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
      expect(ret1).to.equal(ret2);
    });

    it('should not return memoized copy when project id is different', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
      const ret2 = api.toApiCommit(2, { id: 'foo' } as MinardCommit );
      expect(ret1).to.not.equal(ret2);
    });

    it('should not return memoized copy when commit id is different', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
      const ret2 = await api.toApiCommit(2, { id: 'bar' } as MinardCommit );
      expect(ret1).to.not.equal(ret2);
    });
  });

  describe('getProject', () => {
    class MockInternalJsonApi extends JsonApiModule {
      public constructor() {
        super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      }
      public async getProject(projectId: number | string) {
        return {
          id: 'foo',
        };
      }
    }
    it('should return memoized copy when passed same project id', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.getProject(1);
      const ret2 = await api.getProject(1);
      const ret3 = await api.getProject('1');
      expect(ret1).to.equal(ret2);
      expect(ret1).to.equal(ret3);
    });

    it('should not return memoized copy when project is is different', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.getProject(1);
      const ret2 = await api.getProject(2);
      expect(ret1).to.not.equal(ret2);
    });
  });

  describe('getBranch', () => {
    class MockInternalJsonApi extends JsonApiModule {
      public constructor() {
        super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      }
      public async getBranch(projectId: number | string) {
        return {
          id: 'foo',
        };
      }
    }
    it('should return memoized copy when passed same project id and branch name', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.getBranch(1, 'master');
      const ret2 = await api.getBranch(1, 'master');
      expect(ret1).to.equal(ret2);
    });

    it('should not return memoized copy when project id is different', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.getBranch(1, 'master');
      const ret2 = await api.getBranch(2, 'master');
      expect(ret1).to.not.equal(ret2);
    });

    it('should not return memoized copy when branch name is different', async () => {
      const api = memoizeApi(new MockInternalJsonApi());
      const ret1 = await api.getBranch(1, 'master');
      const ret2 = await api.getBranch(1, 'foo');
      expect(ret1).to.not.equal(ret2);
    });
  });

});
