
import * as Boom from 'boom';
import 'reflect-metadata';

import AuthenticationModule from '../authentication/authentication-module';
import { EventBus, LocalEventBus } from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import SystemHookModule from '../system-hook/system-hook-module';
import * as queryString from 'querystring';

import { expect } from 'chai';

import ProjectModule, { findActiveCommitters } from './project-module';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  PROJECT_CREATED_EVENT_TYPE,
  PROJECT_DELETED_EVENT_TYPE,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
} from './types';

const fetchMock = require('fetch-mock');

const logger = Logger(undefined, true);

const host = 'gitlab';
const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return 'secret-token';
    }
  }
  return new GitlabClient(host, fetchMock.fetchMock as IFetchStatic,
    new MockAuthModule() as AuthenticationModule, logger);
};

describe('project-module', () => {

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
        {} as GitlabClient,
        logger);

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
        gitlabClient,
        logger);

      fetchMock.restore().mock(
        `${host}${gitlabClient.apiPrefix}/projects/3/repository/commits?per_page=1000&ref_name=master`,
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
        gitlabClient,
        logger);

      fetchMock.restore();
      fetchMock.mock(
        `${host}${gitlabClient.apiPrefix}/projects/3`,
        gitlabProjectResponse);
      fetchMock.mock(
        `${host}${gitlabClient.apiPrefix}/projects/3/repository/branches`,
        gitlabBranchesResponse);

      (<any> projectModule).getBranch = (_projectId: number, name: string) => {
        return {
          name,
          commits: [],
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

  describe('getCommit()', () => {
    it('should work with typical response', async () => {
      // Arrange
      const gitlabCommitResponse = {
        'id': '6104942438c14ec7bd21c6cd5bd995272b3faff6',
        'short_id': '6104942438c',
        'title': 'Sanitize for network graph',
        'author_name': 'randx',
        'author_email': 'dmitriy.zaporozhets@gmail.com',
        'created_at': '2012-09-20T09:06:12+03:00',
        'message': 'Sanitize for network graph',
        'committed_date': '2012-09-20T09:08:12+03:00',
        'authored_date': '2012-09-20T09:06:12+03:00',
        'committer_name': 'fooman',
        'committer_email': 'fooman@gmail.com',
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

      const gitlabClient = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        gitlabClient,
        logger);

      fetchMock.restore().mock(
        `${host}${gitlabClient.apiPrefix}/projects/3/repository/commits/6104942438c14ec7bd21c6cd5bd995272b3faff6`,
        { body: gitlabCommitResponse });

      // Act
      const commit = await projectModule.getCommit(3, '6104942438c14ec7bd21c6cd5bd995272b3faff6') as MinardCommit;

      // Assert
      expect(commit).to.exist;
      expect(commit.id).to.equal('6104942438c14ec7bd21c6cd5bd995272b3faff6');
      expect(commit.message).to.equal('Sanitize for network graph');
      expect(commit.author.email).to.equal('dmitriy.zaporozhets@gmail.com');
      expect(commit.author.name).to.equal('randx');
      expect(commit.author.timestamp).to.equal('2012-09-20T09:06:12+03:00');
      expect(commit.committer.email).to.equal('fooman@gmail.com');
      expect(commit.committer.name).to.equal('fooman');
      expect(commit.committer.timestamp).to.equal('2012-09-20T09:08:12+03:00');
    });
  });

  describe('findActiveCommitters(...)', () => {
    it('should work with project having two branches', async () => {
      // Arrange
      const project = {
        branches: [
          {
            commits: [
              {
                'author': {
                  'name': 'Jeremy',
                  'email': 'jashkenas@example.com',
                  'timestamp': '2012-09-20T09:06:12+03:00',
                },
              },
              {
                'author': {
                  'name': 'Fooman',
                  'email': 'fooman@example.com',
                  'timestamp': '2012-09-20T09:08:12+03:00',
                },
              },
            ],
          },
          {
            commits: [
              {
                'author': {
                  'name': 'Barwoman',
                  'email': 'barwoman@example.com',
                  'timestamp': '2012-09-20T09:07:12+03:00',
                },
              },
              {
                'author': {
                  'name': 'FooBarMan',
                  'email': 'foobarman@example.com',
                  'timestamp': '2012-09-20T09:09:12+03:00',
                },
              },
              {
                'author': {
                  'name': 'Barwoman',
                  'email': 'barwoman@example.com',
                  'timestamp': '2012-09-20T09:10:12+03:00',
                },
              },
            ],
          },
        ],
      } as MinardProject;

      // Act
      const committers = findActiveCommitters(project.branches);

      // Assert
      expect(committers.length).to.equal(4);
      expect(committers[0].name).to.equal('Jeremy');
      expect(committers[0].email).to.equal('jashkenas@example.com');
      expect(committers[0].timestamp).to.equal('2012-09-20T09:06:12+03:00');
    });
  });

  describe('createProject', () => {

    const projectId = 10;
    const teamId = 5;
    const name = 'foo-project';
    const path = name;
    const description = 'my foo project';

    function arrangeProjectModule(status: number, body: any, eventBus?: EventBus, ) {
      const bus = eventBus || new LocalEventBus();
      const client = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        bus,
        client,
        logger);
      const params = {
        name,
        path: name,
        public: false,
        description,
        namespace_id: teamId,
      };
      const mockUrl = `${host}${client.apiPrefix}/projects?${queryString.stringify(params)}`;
      fetchMock.restore().mock(
        mockUrl,
        {
          status,
          body,
        },
        {
          method: 'POST',
        }
      );
      return projectModule;
    }

    it('should work when gitlab project creation is successful', async () => {
      // Arrange
      const bus = new LocalEventBus();
      const promise = bus.filterEvents<ProjectCreatedEvent>(PROJECT_CREATED_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();
      const projectModule = arrangeProjectModule(201, { id: projectId, path }, bus);

      // Act
      const id = await projectModule.createProject(teamId, name, description);
      const payload = await promise;

      // Assert
      expect(id).to.equal(projectId);
      expect(payload.description).to.equal(description);
      expect(payload.projectId).to.equal(projectId);
      expect(payload.teamId).to.equal(teamId);
      expect(payload.name).to.equal(name);
    });

    it('should throw server error when gitlab response status is not 201', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, { id: projectId, path });

      // Act & Assert
      try {
        await projectModule.createProject(teamId, name, description);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(true);
      }
    });

    it('should throw correct error when project name already exists', async () => {
      // Arrange
      const response = {
        'message': {
          'name': [
            'has already been taken',
          ],
          'path': [
            'has already been taken',
          ],
          'limit_reached': [],
        },
      };
      const projectModule = arrangeProjectModule(400, response);

      // Act & Assert
      try {
        await projectModule.createProject(teamId, name, description);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(false);
        expect((<Boom.BoomError> err).data).to.equal('name-already-taken');
      }
    });

    it('should throw if gitlab response is missing project id', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(201, { foo: 'bar', path });

      // Act & Assert
      try {
        await projectModule.createProject(teamId, name, description);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(true);
      }
    });

    it('should throw if gitlab response has invalid project path', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(201, { foo: 'bar', path: 'foo' });

      // Act & Assert
      try {
        await projectModule.createProject(teamId, name, description);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(true);
      }
    });
  });

  describe('deleteProject()', () => {
    const projectId = 10;
    function arrangeProjectModule(status: number, body: any, eventBus?: EventBus, ) {
      const bus = eventBus || new LocalEventBus();
      const client = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        bus,
        client,
        logger);
      const mockUrl = `${host}${client.apiPrefix}/projects/${projectId}`;
      fetchMock.restore().mock(
        mockUrl,
        {
          status,
          body,
        },
        {
          method: 'DELETE',
        }
      );
      return projectModule;
    }

    it('should create deleted event when gitlab project deletion is successful', async () => {
      // Arrange
      let called = false;
      const bus = new LocalEventBus();
      bus.filterEvents<ProjectDeletedEvent>(PROJECT_DELETED_EVENT_TYPE)
        .subscribe(event => {
          expect(event.payload.projectId).to.equal(projectId);
          called = true;
        });
      const projectModule = arrangeProjectModule(200, 'true', bus);

      // Act
      await projectModule.deleteProject(projectId);

      // Assert
      expect(called).to.equal(true);
    });

    it('should throw when gitlab responds with invalid status code', async () => {
      const projectModule = arrangeProjectModule(201, 'true');
     // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(true);
      }
    });

    it('should throw when gitlab responds with invalid response body', async () => {
      const projectModule = arrangeProjectModule(200, 'foo');
     // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(true);
      }
    });

    it('should throw 404 when gitlab responds that project was not found', async () => {
      const projectModule = arrangeProjectModule(404,
        {
          message: '404 Project Not Found',
        }
      );
      // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).isServer).to.equal(false);
        expect((<Boom.BoomError> err).output.statusCode).to.equal(404);
      }
    });

  });

});
