
import 'reflect-metadata';

import { expect } from 'chai';

import { toJsonApi } from './deployment-json-api';

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

describe('deployment-json-api', () => {
  it('gitlabResponseToJsonApi()', () => {
    const converted = toJsonApi(deployments) as any;

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
