
import 'reflect-metadata';

import DeploymentModule from './deployment-module';
import { expect } from 'chai';
import { IFetchStatic } from '../shared/fetch.d.ts';
import { GitlabClient } from '../shared/gitlab-client'

const fetchMock = require('fetch-mock');


[
   {
      "id" : 1,
      "url" : "https://gitlab.example.com/hook",
      "created_at" : "2015-11-04T20:07:35.874Z"
   }
]

const gitLabBuildsResponse = [
  {
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
    'created_at': '2015-12-24T15:51:21.802Z',
    'artifacts_file': {
      'filename': 'artifacts.zip',
      'size': 1000,
    },
    'finished_at': '2015-12-24T17:54:27.895Z',
    'id': 7,
    'name': 'teaspoon',
    'ref': 'master',
    'runner': null,
    'stage': 'test',
    'started_at': '2015-12-24T17:54:27.722Z',
    'status': 'failed',
    'tag': false,
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
  },
  {
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
    'created_at': '2015-12-24T15:51:21.727Z',
    'artifacts_file': null,
    'finished_at': '2015-12-24T17:54:24.921Z',
    'id': 6,
    'name': 'spinach:other',
    'ref': 'master',
    'runner': null,
    'stage': 'test',
    'started_at': '2015-12-24T17:54:24.729Z',
    'status': 'failed',
    'tag': false,
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
  },
];


describe('deployment-module', () => {
  it('normalizeGitLabResponse', () => {
    const converted = DeploymentModule.normalizeGitLabResponse(gitLabBuildsResponse) as any;
    expect(converted).to.have.length(2);

    // test first
    expect(converted[0].id).to.equal(7);
    expect(converted[0].commit).to.exist;
    expect(converted[0].commit.id).to.equal('0ff3ae198f8601a285adcf5c0fff204ee6fba5fd');
    expect(converted[0].commit.message).to.equal('Test the CI integration.');
    expect(converted[0].finished_at).to.equal('2015-12-24T17:54:27.895Z');
    expect(converted[0].status).to.equal('failed');
    expect(converted[0].user.id).to.equal(1);
    expect(converted[0].user.username).to.equal('root');

    // test second
    expect(converted[1].id).to.equal(6);
  });


  it('gitlabResponseToJsonApi', () => {
    const converted = DeploymentModule.gitlabResponseToJsonApi(gitLabBuildsResponse) as any;

    const data = converted.data;
    expect(data).to.have.length(2);

    // id and type
    expect(data[0].id).to.equal('7');
    expect(data[0].type).to.equal('deployments');

    // attributes
    expect(data[0].attributes['finished-at']).to.equal('2015-12-24T17:54:27.895Z');
    expect(data[0].attributes.status).to.equal('failed');

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

  it('can fetch deployments given project id', async () => {
    // Arrange
    const host = 'gitlab';
    const gitlabClient = new GitlabClient(host, fetchMock.fetchMock as IFetchStatic);
    fetchMock.mock(`^${host}${gitlabClient.apiPrefix}/`, gitLabBuildsResponse);
    const deploymentModule = new DeploymentModule(gitlabClient);

    // Act
    const deployments = await deploymentModule.fetchDeploymentsFromGitLab(1);

    // Assert
    expect(deployments.length).equals(2)
  });
});

