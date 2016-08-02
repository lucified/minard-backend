
import 'reflect-metadata';

import DeploymentModule, { MinardDeployment } from '../deployment/deployment-module';
import ProjectModule, { MinardProject } from '../project/project-module';

import JsonApiModule, { ApiDeployment, ApiProject, deploymentToJsonApi, projectToJsonApi } from './json-api-module';
import { expect } from 'chai';

interface JsonApiResource {
  id: string;
  type: string;
  attributes: any;
  relationships: any;
}

describe('json-api-module', () => {
  it('projectToJsonApi()', () => {
    let project: ApiProject;

    project = {
      id: 329,
      name: 'example-project',
      path: 'sepo/example-project',
      branches: [
        {
          id: '329-master',
          name: 'master',
          deployments: [
            {
              id: 'df897as89f7asasdf',
            },
            {
              id: 'ds8a7f98as7f890ds',
            },
          ] as {} as ApiDeployment[],
          commits: [
            {
              id: '8ds7f89as7f89sa',
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
            },
            {
              id: 'dsf7a678as697f',
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
            },
          ],
        },
        {
          id: '329-new-layout',
          name: 'new-layout',
          commits: [
            {
              id: 'ds7f679f8a6978f6a789',
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
              id: 'dsaf7as6f7as96',
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
          ],
          deployments: [
            {
              id: 'df80sa7f809dsa7f089',
            },
            {
              id: 'das70f8sa7f98sa78f9',
            },
          ] as {} as ApiDeployment[],
        },
      ],
    };

    const converted = projectToJsonApi(project);
    const data = converted.data;

    // console.log(JSON.stringify(converted, null, 2));

    // id and type
    expect(data.id).to.equal('329');
    expect(data.type).to.equal('projects');

    // attributes
    expect(data.attributes.name).to.equal('example-project');

    // branches relationship
    expect(data.relationships.branches).to.exist;
    expect(data.relationships.branches.data).to.have.length(2);

    expect(data.relationships.branches.data[0].id).to.equal('329-master');
    expect(data.relationships.branches.data[1].id).to.equal('329-new-layout');

    expect(data.relationships.branches.data[0].type).to.equal('branches');
    expect(data.relationships.branches.data[1].type).to.equal('branches');

    // included branches
    const branch1 = converted.included
      .find((item: JsonApiResource) => item.type === 'branches' && item.id === '329-master');
    expect(branch1).to.exist;
    expect(branch1.attributes.name).to.equal('master');
    expect(branch1.relationships).to.exist;
    expect(branch1.relationships.commits.data).to.have.length(2);
    expect(branch1.relationships.commits.data[0].id).to.equal('8ds7f89as7f89sa');
    expect(branch1.relationships.commits.data[1].id).to.equal('dsf7a678as697f');

    expect(branch1.relationships.project).to.exist;
    expect(branch1.relationships.project.data).to.exist;
    expect(branch1.relationships.project.data.id).to.equal('329');
    expect(branch1.relationships.project.data.type).to.equal('projects');

    // commits should not be included
    const commitsFound = converted.included.filter((item: JsonApiResource) => item.type === 'commits');
    expect(commitsFound).to.have.length(0, 'Commits should not be included');

    // deployments should not be included
    const deploymentsFound = converted.included.filter((item: JsonApiResource) => item.type === 'deployments');
    expect(deploymentsFound).to.have.length(0, 'Deployments should not be included');
  });

  describe('deploymentToJsonApi()', () => {
    it('should work with array of single deployment', () => {
      const deployments = [{
        'commit': {
          'author_email': 'admin@example.com',
          'author_name': 'Administrator',
          'created_at': '2015-12-24T16:51:14.000+01:00',
          'id': '0ff3ae198f8601a285adcf5c0fff204ee6fba5fd',
          'message': 'Test the CI integration.',
          'short_id': '0ff3ae19',
          'title': 'Test the CI integration.',
        },
        'coverage': null,
        'created_at': '2015-12-24T15:51:21.880Z',
        'artifacts_file': null,
        'finished_at': '2015-12-24T17:54:31.198Z',
        'id': 8,
        'name': 'rubocop',
        'ref': 'master',
        'runner': null,
        'stage': 'test',
        'started_at': '2015-12-24T17:54:30.733Z',
        'status': 'failed',
        'tag': false,
        'url': 'http://dfa-4-5.localhost',
        'user': {
          'avatar_url': 'http://www.gravatar.com/avatar/e64c7d89f26bd1972efa854d13d7dd61?s=80&d=identicon',
          'bio': null,
          'created_at': '2015-12-21T13:14:24.077Z',
          'id': 1,
          'is_admin': true,
          'linkedin': '',
          'name': 'Administrator',
          'skype': '',
          'state': 'active',
          'twitter': '',
          'username': 'root',
          'web_url': 'http://gitlab.dev/u/root',
          'website_url': '',
        },
      }];
      const converted = deploymentToJsonApi(deployments) as any;

      const data = converted.data;
      expect(data).to.have.length(1);

      // id and type
      expect(data[0].id).to.equal('8');
      expect(data[0].type).to.equal('deployments');

      // attributes
      expect(data[0].attributes['finished-at']).to.equal('2015-12-24T17:54:31.198Z');
      expect(data[0].attributes.status).to.equal('failed');
      expect(data[0].attributes.url).to.equal('http://dfa-4-5.localhost');

      // commit relationship
      expect(data[0].relationships.commit).to.exist;
      expect(data[0].relationships.commit.data.type).to.equal('commits');
      expect(data[0].relationships.commit.data.id).to.equal('0ff3ae198f8601a285adcf5c0fff204ee6fba5fd');

      // user relationship
      expect(data[0].relationships.user).to.exist;
      expect(data[0].relationships.user.data.type).to.equal('users');
      expect(data[0].relationships.user.data.id).to.equal('1');

      // included user
      const includedUser = converted.included.find((item: any) => item.id === '1' && item.type === 'users');
      expect(includedUser).to.exist;
      expect(includedUser.id).to.equal('1');
      expect(includedUser.attributes.username).to.equal('root');

      // included commit
      const includedCommit = converted.included.find((item: any) =>
        item.id === '0ff3ae198f8601a285adcf5c0fff204ee6fba5fd' && item.type === 'commits');
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal('0ff3ae198f8601a285adcf5c0fff204ee6fba5fd');
      expect(includedCommit.attributes.message).to.equal('Test the CI integration.');
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
              },
              {
                id: `${projectId}-new-feature`,
                name: 'new-feature',
              },
            ],
          } as MinardProject;
        }
      }
      const jsonApiModule = new JsonApiModule(
        new MockDeploymentModule() as DeploymentModule,
        new MockProjectsModule() as ProjectModule);

      // Act
      const response = await jsonApiModule.getProject(1);

      // Assert

      const data = response.data;
      expect(data).to.exist;

      expect(data.id).to.equal('1');
      expect(data.type).to.equal('projects');
      expect(data.attributes.name).to.equal('project-name');

      expect(data.relationships.branches).to.exist;
      expect(data.relationships.branches.data).to.exist;
      expect(data.relationships.branches.data[0].id).to.equal('1-master');
      expect(data.relationships.branches.data[1].id).to.equal('1-new-feature');

      expect(response.included).to.exist;
      const master = response.included.find((item: any) => item.id === '1-master');
      expect(master).to.exist;
      expect(master.relationships.deployments.data).to.exist;
      expect(master.relationships.deployments.data[0]).to.exist;
      expect(master.relationships.deployments.data[0].id).to.equal('8ds7f8asfasd');
      expect(master.relationships.deployments.data[1].id).to.equal('98df789as897');
    });
  });

});
