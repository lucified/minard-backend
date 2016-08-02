
import 'reflect-metadata';

import AuthenticationModule from '../authentication/authentication-module';
import LocalEventBus from '../event-bus/local-event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import SystemHookModule from '../system-hook/system-hook-module';
import ProjectModule, { MinardBranch, MinardProject } from './project-module';
import { expect } from 'chai';

const fetchMock = require('fetch-mock');

const host = 'gitlab';
const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return 'secret-token';
    }
  }
  return new GitlabClient(host, fetchMock.fetchMock as IFetchStatic,
    new MockAuthModule() as AuthenticationModule);
};

describe('project-module', () => {
  it('receiveHook', (done) => {

    const eventBus = new LocalEventBus();
    const projectModule = new ProjectModule(
      {} as AuthenticationModule,
      {} as SystemHookModule,
      eventBus,
      {} as GitlabClient);

    eventBus.subscribe((item: any) => {
      expect(item.type).to.equal('project-created');
      expect(item.projectId).to.equal(74);
      done();
    });

    const userCreated = {
      'created_at': '2012-07-21T07:30:54Z',
      'updated_at': '2012-07-21T07:38:22Z',
      'event_name': 'project_create',
      'name': 'StoreCloud',
      'owner_email': 'johnsmith@gmail.com',
      'owner_name': 'John Smith',
      'path': 'storecloud',
      'path_with_namespace': 'jsmith/storecloud',
      'project_id': 74,
      'project_visibility': 'private',
    };
    projectModule.receiveHook(userCreated);
  });

  describe('toMinardCommit()', () => {
    it('should correctly convert commit with separate author and committer', () => {
      // Arrange
      const gitlabCommit = {
        'id': '6104942438c14ec7bd21c6cd5bd995272b3faff6',
        'short_id': '6104942438c',
        'title': 'Sanitize for network graph',
        'author_name': 'randx',
        'author_email': 'dmitriy.zaporozhets@gmail.com',
        'created_at': '2012-09-20T09:06:12+03:00',
        'message': 'Sanitize for network graph',
        'committed_date': '2012-09-20T09:09:12+03:00',
        'authored_date': '2012-09-20T09:06:12+03:00',
        'committer_name': 'fooman',
        'committer_email': 'foobar@gmail.com',
        'parent_ids': [
          'ae1d9fb46aa2b07ee9836d49862ec4e2c46fbbba',
        ],
        'stats': {
          'additions': 15,
          'deletions': 10,
          'total': 25,
        },
        'status': 'running',
      };
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        {} as GitlabClient);

      // Act
      const commit = projectModule.toMinardCommit(gitlabCommit);

      // Assert
      expect(commit.id).to.equal('6104942438c14ec7bd21c6cd5bd995272b3faff6');
      expect(commit.message).to.equal('Sanitize for network graph');
      expect(commit.author.email).to.equal('dmitriy.zaporozhets@gmail.com');
      expect(commit.author.name).to.equal('randx');
      expect(commit.author.timestamp).to.equal('2012-09-20T09:06:12+03:00');
      expect(commit.committer.email).to.equal('foobar@gmail.com');
      expect(commit.committer.name).to.equal('fooman');
      expect(commit.committer.timestamp).to.equal('2012-09-20T09:09:12+03:00');
    });
  });

  describe('getBranch()', () => {
    it('should work correcly when response has two commits', async () => {
      // Arrange
      const gitlabCommitsResponse = [
        {
          'id': 'ed899a2f4b50b4370feeea94676502b42383c746',
          'short_id': 'ed899a2f4b5',
          'title': 'Replace sanitize with escape once',
          'author_name': 'Dmitriy Zaporozhets',
          'author_email': 'dzaporozhets@sphereconsultinginc.com',
          'created_at': '2012-09-20T11:50:22+03:00',
          'message': 'Replace sanitize with escape once',
          'allow_failure': false,
        },
        {
          'id': '6104942438c14ec7bd21c6cd5bd995272b3faff6',
          'short_id': '6104942438c',
          'title': 'Sanitize for network graph',
          'author_name': 'randx',
          'author_email': 'dmitriy.zaporozhets@gmail.com',
          'created_at': '2012-09-20T09:06:12+03:00',
          'message': 'Sanitize for network graph',
          'allow_failure': false,
        },
      ];
      const gitlabClient = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        gitlabClient);

      fetchMock.restore().mock(
        `${host}${gitlabClient.apiPrefix}/projects/3/repository/commits/master`,
        gitlabCommitsResponse);

      // Act
      const branch = await projectModule.getBranch(3, 'master') as MinardBranch;

      // Assert
      expect(branch.name).to.equal('master');
      expect(branch.commits).to.have.length(2);

      expect(branch.commits[0].id).to.equal('ed899a2f4b50b4370feeea94676502b42383c746');
      expect(branch.commits[1].id).to.equal('6104942438c14ec7bd21c6cd5bd995272b3faff6');
      expect(branch.commits[0].author.email).to.equal('dzaporozhets@sphereconsultinginc.com');
    });
  });

  describe('getProject()', () => {
    it('should work correcly', async () => {

      const gitlabProjectResponse = {
        'id': 3,
        'description': null,
        'default_branch': 'master',
        'public': false,
        'visibility_level': 0,
        'ssh_url_to_repo': 'git@example.com:diaspora/diaspora-project-site.git',
        'http_url_to_repo': 'http://example.com/diaspora/diaspora-project-site.git',
        'web_url': 'http://example.com/diaspora/diaspora-project-site',
        'tag_list': [
          'example',
          'disapora project',
        ],
        'owner': {
          'id': 3,
          'name': 'Diaspora',
          'created_at': '2013-09-30T13:46:02Z',
        },
        'name': 'Diaspora Project Site',
        'name_with_namespace': 'Diaspora / Diaspora Project Site',
        'path': 'diaspora-project-site',
        'path_with_namespace': 'diaspora/diaspora-project-site',
        'issues_enabled': true,
        'open_issues_count': 1,
        'merge_requests_enabled': true,
        'builds_enabled': true,
        'wiki_enabled': true,
        'snippets_enabled': false,
        'container_registry_enabled': false,
        'created_at': '2013-09-30T13:46:02Z',
        'last_activity_at': '2013-09-30T13:46:02Z',
        'creator_id': 3,
        'namespace': {
          'created_at': '2013-09-30T13:46:02Z',
          'description': '',
          'id': 3,
          'name': 'Diaspora',
          'owner_id': 1,
          'path': 'diaspora',
          'updated_at': '2013-09-30T13:46:02Z',
        },
        'permissions': {
          'project_access': {
            'access_level': 10,
            'notification_level': 3,
          },
          'group_access': {
            'access_level': 50,
            'notification_level': 3,
          },
        },
        'archived': false,
        'avatar_url': 'http://example.com/uploads/project/avatar/3/uploads/avatar.png',
        'shared_runners_enabled': true,
        'forks_count': 0,
        'star_count': 0,
        'runners_token': 'b8bc4a7a29eb76ea83cf79e4908c2b',
        'public_builds': true,
        'shared_with_groups': [
          {
            'group_id': 4,
            'group_name': 'Twitter',
            'group_access_level': 30,
          },
          {
            'group_id': 3,
            'group_name': 'Gitlab Org',
            'group_access_level': 10,
          },
        ],
      };

      const gitlabBranchesResponse = [{
        'name': 'async',
        'commit': {
          'id': 'a2b702edecdf41f07b42653eb1abe30ce98b9fca',
          'parents': [
            {
              'id': '3f94fc7c85061973edc9906ae170cc269b07ca55',
            },
          ],
          'tree': 'c68537c6534a02cc2b176ca1549f4ffa190b58ee',
          'message': "give Caolan credit where it's due (up top)",
          'author': {
            'name': 'Jeremy Ashkenas',
            'email': 'jashkenas@example.com',
          },
          'committer': {
            'name': 'Jeremy Ashkenas',
            'email': 'jashkenas@example.com',
          },
          'authored_date': '2010-12-08T21:28:50+00:00',
          'committed_date': '2010-12-08T21:28:50+00:00',
        },
        'protected': false,
      },
      {
        'name': 'gh-pages',
        'commit': {
          'id': '101c10a60019fe870d21868835f65c25d64968fc',
          'parents': [
            {
              'id': '9c15d2e26945a665131af5d7b6d30a06ba338aaa',
            },
          ],
          'tree': 'fb5cc9d45da3014b17a876ad539976a0fb9b352a',
          'message': 'Underscore.js 1.5.2',
          'author': {
            'name': 'Jeremy Ashkenas',
            'email': 'jashkenas@example.com',
          },
          'committer': {
            'name': 'Jeremy Ashkenas',
            'email': 'jashkenas@example.com',
          },
          'authored_date': '2013-09-07T12:58:21+00:00',
          'committed_date': '2013-09-07T12:58:21+00:00',
        },
        'protected': false,
      }];

      const gitlabClient = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        gitlabClient);

      fetchMock.restore();
      fetchMock.mock(
        `${host}${gitlabClient.apiPrefix}/projects/3`,
        gitlabProjectResponse);
      fetchMock.mock(
        `${host}${gitlabClient.apiPrefix}/projects/3/repository/branches`,
        gitlabBranchesResponse);

      (<any> projectModule).getBranch = function(_projectId: number, name: string) {
        return {
          name: name,
        };
      };

      // Act
      const project = await projectModule.getProject(3) as MinardProject;

      // Assert
      expect(project.id).to.equal(3);
      expect(project.name).to.equal('Diaspora Project Site');
      expect(project.branches).to.have.length(2);

      expect(project.branches[0].name).to.equal('async');
      expect(project.branches[1].name).to.equal('gh-pages');
    });
  });

});
