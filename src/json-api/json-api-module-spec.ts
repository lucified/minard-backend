
import 'reflect-metadata';

import { values } from 'lodash';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
} from '../project/';

import {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiProject,
  InternalJsonApi,
  JsonApiEntity,
  JsonApiResponse,
  MemoizedInternalJsonApi,
  activityToJsonApi,
  branchToJsonApi,
  commitToJsonApi,
  deploymentToJsonApi,
  projectToJsonApi,
} from './json-api-module';

import { expect } from 'chai';

const exampleCommitOne = {
  id: '1-8ds7f89as7f89sa',
  hash: '8ds7f89as7f89sa',
  message: 'Remove unnecessary logging',
  author: {
    name: 'Fooman',
    email: 'fooman@gmail.com',
    timestamp: '2015-12-24T15:51:21.802Z',
  },
  committer: {
    name: 'Barman',
    email: 'barman@gmail.com',
    timestamp: '2015-12-24T16:51:21.802Z',
  },
} as ApiCommit;

const exampleCommitTwo = {
  id: '1-dsf7a678as697f',
  hash: '8ds7f89as7f89sa',
  message: 'Improve colors',
  author: {
    name: 'FooFooman',
    email: 'foofooman@gmail.com',
    timestamp: '2015-12-24T17:51:21.802Z',
  },
  committer: {
    name: 'BarBarman',
    email: 'barbarman@gmail.com',
    timestamp: '2015-12-24T18:51:21.802Z',
  },
} as ApiCommit;

const masterBranchCommits = [exampleCommitOne, exampleCommitTwo];

const newLayoutBranchCommits = [
  {
    id: '1-ds7f679f8a6978f6a789',
    hash: 'ds7f679f8a6978f6a789',
    message: 'Try out different layout',
    author: {
      name: 'FooFooFooman',
      email: 'foofoofooman@gmail.com',
      timestamp: '2015-12-24T19:51:21.802Z',
    },
    committer: {
      name: 'BarBarBarman',
      email: 'barbarbarman@gmail.com',
      timestamp: '2015-12-24T20:51:21.802Z',
    },
  },
  {
    id: '1-dsaf7as6f7as96',
    hash: 'ds7f679f8a6978f6a789',
    message: 'Fix responsiveness of new layout',
    author: {
      name: 'FooFooFooFooman',
      email: 'foofoofoofooman@gmail.com',
      timestamp: '2015-12-24T21:51:21.802Z',
    },
    committer: {
      name: 'BarBarBarBarman',
      email: 'barbarbarbarman@gmail.com',
      timestamp: '2015-12-24T22:51:21.802Z',
    },
  },
] as ApiCommit[];

const exampleDeploymentOne = {
  id: '1-1',
  url: 'http://www.foobar.com',
  status: 'success',
  commit: exampleCommitOne,
  creator: {
    name: 'Fooman',
    email: 'fooman@gmail.com',
    timestamp: '2015-12-24T17:54:31.198Z',
  },
} as {} as ApiDeployment;

const exampleDeploymentTwo = {
  id: '1-2',
  url: 'http://www.foobarbar.com',
  finished_at: '2015-12-24T19:54:31.198Z',
  status: 'success',
  commit: exampleCommitTwo,
  creator: {
    name: 'Barwoman',
    email: 'barwoman@gmail.com',
    timestamp: '2015-12-24T17:55:31.198Z',
  },
} as {} as ApiDeployment;

const exampleMasterBranch = {
  id: '1-master',
  name: 'master',
  deployments: [exampleDeploymentOne, exampleDeploymentTwo],
  commits: masterBranchCommits,
} as ApiBranch;

const exampleNewLayoutBranch = {
  id: '1-new-layout',
  name: 'new-layout',
  commits: newLayoutBranchCommits,
  deployments: [
    {
      id: 'df80sa7f809dsa7f089',
    },
    {
      id: 'das70f8sa7f98sa78f9',
    },
  ] as {} as ApiDeployment[],
} as ApiBranch;

const exampleProject = {
  id: '1',
  name: 'example-project',
  path: 'sepo/example-project',
  branches: [exampleMasterBranch, exampleNewLayoutBranch],
} as ApiProject;

exampleProject.branches.forEach(item => {
  item.project = exampleProject;
});

exampleCommitOne.deployments = [exampleDeploymentOne];
exampleCommitTwo.deployments = [exampleDeploymentTwo];

const exampleActivity = {
  project: exampleProject,
  branch: exampleMasterBranch,
  id: 'dasfsa',
  activityType: 'deployment',
  deployment: exampleDeploymentOne,
  timestamp: exampleDeploymentOne.finished_at,
} as ApiActivity;

describe('json-api-module', () => {
  it('projectToJsonApi()', () => {

    const project = exampleProject;
    const converted = projectToJsonApi(project);
    const data = converted.data;

    // id and type
    expect(data.id).to.equal('1');
    expect(data.type).to.equal('projects');

    // attributes
    expect(data.attributes.name).to.equal('example-project');

    // branches relationship
    expect(data.relationships.branches).to.exist;
    expect(data.relationships.branches.data).to.have.length(2);

    expect(data.relationships.branches.data[0].id).to.equal('1-master');
    expect(data.relationships.branches.data[1].id).to.equal('1-new-layout');

    expect(data.relationships.branches.data[0].type).to.equal('branches');
    expect(data.relationships.branches.data[1].type).to.equal('branches');

    // included branches
    const branch1 = converted.included.find(
      (item: JsonApiEntity) => item.type === 'branches' && item.id === '1-master');
    expect(branch1).to.exist;
    expect(branch1.attributes.name).to.equal('master');
    expect(branch1.relationships).to.exist;
    expect(branch1.relationships.commits.data).to.have.length(2);
    expect(branch1.relationships.commits.data[0].id).to.equal('1-8ds7f89as7f89sa');
    expect(branch1.relationships.commits.data[1].id).to.equal('1-dsf7a678as697f');

    expect(branch1.relationships.project).to.exist;
    expect(branch1.relationships.project.data).to.exist;
    expect(branch1.relationships.project.data.id).to.equal('1');
    expect(branch1.relationships.project.data.type).to.equal('projects');

    // commits should not be included
    const commitsFound = converted.included.filter((item: JsonApiEntity) => item.type === 'commits');
    expect(commitsFound).to.have.length(0, 'Commits should not be included');

    // deployments should not be included
    const deploymentsFound = converted.included.filter((item: JsonApiEntity) => item.type === 'deployments');
    expect(deploymentsFound).to.have.length(0, 'Deployments should not be included');
  });

  describe('deploymentToJsonApi()', () => {
    it('should work with array of single deployment', () => {
      const deployments = [exampleDeploymentOne];
      const converted = deploymentToJsonApi(deployments) as any;

      const data = converted.data;
      expect(data).to.have.length(1);

      // id and type
      expect(data[0].id).to.equal('1-1');
      expect(data[0].type).to.equal('deployments');

      // attributes
      expect(data[0].attributes.status).to.equal('success');
      expect(data[0].attributes.url).to.equal('http://www.foobar.com');
      expect(data[0].attributes.creator).to.deep.equal(exampleDeploymentOne.creator);

      // commit relationship
      expect(data[0].relationships.commit).to.exist;
      expect(data[0].relationships.commit.data.type).to.equal('commits');
      expect(data[0].relationships.commit.data.id).to.equal('1-8ds7f89as7f89sa');

      // included commit
      const includedCommit = converted.included.find((item: any) =>
        item.id === '1-8ds7f89as7f89sa' && item.type === 'commits');
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal('1-8ds7f89as7f89sa');
      expect(includedCommit.attributes.hash).to.equal('8ds7f89as7f89sa');
      expect(includedCommit.attributes.message).to.equal('Remove unnecessary logging');
    });
  });

  describe('branchToJsonApi()', () => {
    it('should work with a single branch', () => {

      const branch = exampleMasterBranch;
      const converted = branchToJsonApi(branch) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal('1-master');
      expect(data.type).to.equal('branches');

      // attributes
      expect(data.attributes.name).to.equal('master');

      // commit relationship
      expect(data.relationships.commits).to.exist;
      expect(data.relationships.commits.data).to.have.length(2);
      expect(data.relationships.commits.data[0].id).to.equal('1-8ds7f89as7f89sa');
      expect(data.relationships.commits.data[1].id).to.equal('1-dsf7a678as697f');

      // deployment relationship
      expect(data.relationships.deployments).to.exist;
      expect(data.relationships.deployments.data).to.have.length(2);
      expect(data.relationships.deployments.data[0].id).to.equal('1-1');
      expect(data.relationships.deployments.data[1].id).to.equal('1-2');

      // included commit
      const includedCommit = (<any> converted.included).find((item: any) =>
        item.id === '1-8ds7f89as7f89sa' && item.type === 'commits');
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal('1-8ds7f89as7f89sa');
      expect(includedCommit.attributes.hash).to.equal('8ds7f89as7f89sa');
      expect(includedCommit.attributes.message).to.equal('Remove unnecessary logging');

      // included deployment
      const includedDeployment = (<any> converted.included).find((item: any) =>
        item.id === '1-1' && item.type === 'deployments');
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal('1-1');
      expect(includedDeployment.attributes.url).to.equal('http://www.foobar.com');
    });
  });

  describe('commitToJsonApi()', () => {
    it('should work with a single commit', () => {

      const commit = exampleCommitOne;
      const converted = commitToJsonApi(commit) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal('1-8ds7f89as7f89sa');
      expect(data.type).to.equal('commits');

      // attributes
      expect(data.attributes.hash).to.equal('8ds7f89as7f89sa');
      expect(data.attributes.message).to.equal('Remove unnecessary logging');
      expect(data.attributes.author.name).to.equal('Fooman');
      expect(data.attributes.author.email).to.equal('fooman@gmail.com');
      expect(data.attributes.author.timestamp).to.equal('2015-12-24T15:51:21.802Z');
      expect(data.attributes.committer.name).to.equal('Barman');
      expect(data.attributes.committer.email).to.equal('barman@gmail.com');
      expect(data.attributes.committer.timestamp).to.equal('2015-12-24T16:51:21.802Z');

      // deployments relationship
      expect(data.relationships.deployments).to.exist;
      expect(data.relationships.deployments.data).to.have.length(1);
      expect(data.relationships.deployments.data[0].id).to.equal(exampleCommitOne.deployments[0].id);

      // no extra stuff
      expect(values(data.relationships)).to.have.length(1);
      expect(values(converted.included)).to.have.length(0);

      // TODO: should deployments be included?
    });
  });

  describe('activityToJsonApi()', () => {
    it('should work with a single commit', () => {
      const activity = exampleActivity as ApiActivity;
      const converted = activityToJsonApi(activity) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(activity.id);
      expect(data.type).to.equal('activities');

      // attributes
      expect(data.attributes.timestamp).to.equal(activity.timestamp);
      expect(data.attributes['activity-type']).to.equal(activity.activityType);

      // included deployment
      const deployment = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'deployments' && item.id === activity.deployment.id);
      expect(deployment).to.exist;

      // included commit (via deployment)
      const commit = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'commits' && item.id === activity.deployment.commit.id);
      expect(commit).to.exist;

      // included project
      const project = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'projects' && item.id === activity.project.id);
      expect(project).to.exist;
      expect(project.attributes.name).to.equal(activity.project.name);

      // include branch that is references from activity
      const branch = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'branches' && item.id === activity.branch.id);
      expect(branch).to.exist;
      expect(branch.attributes.name).to.equal(activity.branch.name);

      // do not include other branches
      const branches = (<any> converted).included.filter(
        (item: JsonApiEntity) => item.type === 'branches');
      expect(branches).to.have.length(1);

      // do not include other commits
      const commits = (<any> converted).included.filter(
        (item: JsonApiEntity) => item.type === 'commits');
      expect(commits).to.have.length(1);
    });
  });

  describe('toApiProject()', () => {
    it('should work in typical case', async () => {
      // Arrange
      // -------
      const minardProject = {
        id: 1,
        branches: [
          {
            name: 'master',
          } as MinardBranch,
        ],
      } as MinardProject;

      const api = {} as InternalJsonApi;
      api.toApiProject = InternalJsonApi.prototype.toApiProject.bind(api);
      api.toApiBranch = async function(project: ApiProject, branch: MinardBranch) {
        expect(project.id).to.equal('1');
        return {
          id: '1-master',
          deployments: [{}, {}],
        };
      };

      // Act
      // ---
      const project = await api.toApiProject(minardProject);

      // Assert
      // ------
      expect(project.id).to.equal('1');
      // Make sure branches are converted to APIBranch:es
      expect(project.branches[0].id).to.equal('1-master');
      expect(project.branches[0].deployments).to.have.length(2);
    });
  });

  describe('MemoizedInternalJsonApi', () => {
    describe('toApiProject', () => {
      class MockInternalJsonApi extends InternalJsonApi {
        public constructor() {
          super({} as any, {} as any, {} as any);
        }
        public async toApiProject(project: MinardProject) {
          return {
            id: project.id,
          };
        }
      }
      it('should return memoized copy when passed an identical object', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
        const ret2 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
        expect(ret1).to.equal(ret2);
      });

      it('should return memoized copy when passed an object that has same id', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
        const ret2 = await api.toApiProject( { id: 1, name: 'bar' } as MinardProject );
        expect(ret1).to.equal(ret2);
      });

      it('should not return memoized copy passed an object with different id', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiProject( { id: 1, name: 'foo' } as MinardProject );
        const ret2 = await api.toApiProject( { id: 2, name: 'foo' } as MinardProject );
        expect(ret1).to.not.equal(ret2);
      });
    });
    describe('toApiBranch', () => {
      class MockInternalJsonApi extends InternalJsonApi {
        public constructor() {
          super({} as any, {} as any, {} as any);
        }
        public async toApiBranch(project: ApiProject, branch: MinardBranch) {
          return {
            id: 'foo',
          };
        }
      }
      it('should return memoized copy when passed an identical object as parameters', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiBranch(
          { id: '1', name: 'foo' } as ApiProject,
          { name: 'foo' } as MinardBranch);
        const ret2 = await api.toApiBranch(
          { id: '1', name: 'foo' } as ApiProject,
          { name: 'foo' } as MinardBranch);
        expect(ret1).to.equal(ret2);
      });

      it('should not return memoized copy when project has different id', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiBranch(
          { id: '1', name: 'foo' } as ApiProject,
          { name: 'foo' } as MinardBranch);
        const ret2 = await api.toApiBranch(
          { id: '2', name: 'foo' } as ApiProject,
          { name: 'foo' } as MinardBranch);
        expect(ret1).to.not.equal(ret2);
      });

      it('should not return memoized copy when branch has different name', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiBranch(
          { id: '1', name: 'foo' } as ApiProject,
          { name: 'foo' } as MinardBranch);
        const ret2 = await api.toApiBranch(
          { id: '1', name: 'foo' } as ApiProject,
          { name: 'bar' } as MinardBranch);
        expect(ret1).to.not.equal(ret2);
      });
    });

    describe('toApiCommit', () => {
      class MockInternalJsonApi extends InternalJsonApi {
        public constructor() {
          super({} as any, {} as any, {} as any);
        }
        public async toApiCommit(projectId: number, commit: MinardCommit) {
          return {
            id: 'foo',
          };
        }
      }
      it('should return memoized copy when passed same project id and identical commit object', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
        const ret2 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
        expect(ret1).to.equal(ret2);
      });

      it('should not return memoized copy when project id is different', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
        const ret2 = api.toApiCommit(2, { id: 'foo' } as MinardCommit );
        expect(ret1).to.not.equal(ret2);
      });

      it('should not return memoized copy when commit id is different', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.toApiCommit(1, { id: 'foo' } as MinardCommit );
        const ret2 = await api.toApiCommit(2, { id: 'bar' } as MinardCommit );
        expect(ret1).to.not.equal(ret2);
      });
    });

    describe('getApiProject', () => {
      class MockInternalJsonApi extends InternalJsonApi {
        public constructor() {
          super({} as any, {} as any, {} as any);
        }
        public async getApiProject(projectId: number | string) {
          return {
            id: 'foo',
          };
        }
      }
      it('should return memoized copy when passed same project id', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.getApiProject(1);
        const ret2 = await api.getApiProject(1);
        const ret3 = await api.getApiProject('1');
        expect(ret1).to.equal(ret2);
        expect(ret1).to.equal(ret3);
      });

      it('should not return memoized copy when project is is different', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.getApiProject(1);
        const ret2 = await api.getApiProject(2);
        expect(ret1).to.not.equal(ret2);
      });
    });

    describe('getApiBranch', () => {
      class MockInternalJsonApi extends InternalJsonApi {
        public constructor() {
          super({} as any, {} as any, {} as any);
        }
        public async getApiBranch(projectId: number | string) {
          return {
            id: 'foo',
          };
        }
      }
      it('should return memoized copy when passed same project id and branch name', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.getApiBranch(1, 'master');
        const ret2 = await api.getApiBranch(1, 'master');
        expect(ret1).to.equal(ret2);
      });

      it('should not return memoized copy when project id is different', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.getApiBranch(1, 'master');
        const ret2 = await api.getApiBranch(2, 'master');
        expect(ret1).to.not.equal(ret2);
      });

      it('should not return memoized copy when branch name is different', async () => {
        const api = new MemoizedInternalJsonApi(new MockInternalJsonApi() as InternalJsonApi);
        const ret1 = await api.getApiBranch(1, 'master');
        const ret2 = await api.getApiBranch(1, 'foo');
        expect(ret1).to.not.equal(ret2);
      });
    });

  });

});
