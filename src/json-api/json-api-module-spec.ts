
import 'reflect-metadata';

import { values } from 'lodash';

import { DeploymentModule,  MinardDeployment } from '../deployment/';
import  { MinardProject, ProjectModule } from '../project/';

<<<<<<< 53413c1473f12855bd8167ac517f1cade0a4eec9
import JsonApiModule, { ApiBranch, ApiCommit, ApiDeployment, ApiProject, JsonApiEntity, JsonApiResponse,
  branchToJsonApi, commitToJsonApi, deploymentToJsonApi, projectToJsonApi } from './json-api-module';
=======
import JsonApiModule, {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiProject,
  JsonApiEntity,
  JsonApiResponse,
  activityToJsonApi,
  branchToJsonApi,
  commitToJsonApi,
  deploymentToJsonApi,
  projectToJsonApi
} from './json-api-module';
>>>>>>> Support json api serialization for activities

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
  finished_at: '2015-12-24T17:54:31.198Z',
  status: 'success',
  commit: exampleCommitOne,
} as {} as ApiDeployment;

const exampleDeploymentTwo = {
  id: '1-2',
  url: 'http://www.foobarbar.com',
  finished_at: '2015-12-24T19:54:31.198Z',
  status: 'success',
  commit: exampleCommitTwo,
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

const exampleActivity = {
  id: 'dasfsa',
  type: 'deployment',
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
      expect(data[0].attributes['finished-at']).to.equal('2015-12-24T17:54:31.198Z');
      expect(data[0].attributes.status).to.equal('success');
      expect(data[0].attributes.url).to.equal('http://www.foobar.com');

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

      // no extra stuff
      expect(values(data.relationships)).to.have.length(0);
      expect(values(converted.included)).to.have.length(0);
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
      expect(data.attributes.type).to.equal(activity.type);

      // deployment relationship
      expect(data.relationships.deployment).to.exist;
      expect(data.relationships.deployment.data.id).to.equal(activity.deployment.id);
      expect(data.relationships.deployment.data.type).to.equal('deployments');

      // included deployment
      const deployment = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'deployments' && item.id === activity.deployment.id);
      expect(deployment).to.exist;

      // included commit
      const commit = (<any> converted).included.find(
        (item: JsonApiEntity) => item.type === 'commits' && item.id === activity.deployment.commit.id);
      expect(commit).to.exist;
    });
  });

  describe('getProject()', () => {
    it('should work in typical case', async () => {
      // Arrange
      class MockDeploymentModule {
        public async getBranchDeployments(_projectId: number, _branchName: string) {
          return [
            {
              id: '8ds7f8asfasd',
            },
            {
              id: '98df789as897',
            },
          ] as {} as MinardDeployment[];
        }
      }
      class MockProjectsModule {
        public async getProject(projectId: number): Promise<MinardProject> {
          return {
            id: projectId,
            name: 'project-name',
            branches: [
              {
                id: `${projectId}-master`,
                name: 'master',
                commits: [],
              },
              {
                id: `${projectId}-new-feature`,
                name: 'new-feature',
                commits: [],
              },
            ],
          } as {} as MinardProject;
        }
      }
      const jsonApiModule = new JsonApiModule(
        new MockDeploymentModule() as DeploymentModule,
        new MockProjectsModule() as ProjectModule);

      // Act
      const response = await jsonApiModule.getProject(1);

      // Assert
      const data = response.data as JsonApiEntity;
      expect(data).to.exist;

      expect(data.id).to.equal('1');
      expect(data.type).to.equal('projects');
      expect(data.attributes.name).to.equal('project-name');

      expect(data.relationships.branches).to.exist;
      expect(data.relationships.branches.data).to.exist;
      expect(data.relationships.branches.data[0].id).to.equal('1-master');
      expect(data.relationships.branches.data[1].id).to.equal('1-new-feature');

      expect(response.included).to.exist;
      const master = (<JsonApiEntity[]> response.included)
        .find((item: any) => item.id === '1-master') as JsonApiEntity;
      expect(master).to.exist;
      expect(master.relationships.deployments.data).to.exist;
      expect(master.relationships.deployments.data[0]).to.exist;
      expect(master.relationships.deployments.data[0].id).to.equal('1-8ds7f8asfasd');
      expect(master.relationships.deployments.data[1].id).to.equal('1-98df789as897');
    });
  });

});
