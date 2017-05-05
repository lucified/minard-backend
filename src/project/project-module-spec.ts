import * as Boom from 'boom';
import { expect } from 'chai';
import * as moment from 'moment';
import * as queryString from 'querystring';
import 'reflect-metadata';

import AuthenticationModule from '../authentication/authentication-module';
import { EventBus, LocalEventBus } from '../event-bus';
import { Commit } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import { MinardCommit } from '../shared/minard-commit';
import { MINARD_ERROR_CODE } from '../shared/minard-error';
import { toGitlabTimestamp } from '../shared/time-conversion';
import SystemHookModule from '../system-hook/system-hook-module';
import { GitlabPushEvent } from './gitlab-push-hook-types';
import ProjectModule from './project-module';
import {
  CODE_PUSHED_EVENT_TYPE,
  CodePushedEvent,
  MinardProject,
  PROJECT_CREATED_EVENT_TYPE,
  PROJECT_DELETED_EVENT_TYPE,
  PROJECT_EDITED_EVENT_TYPE,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectEditedEvent,
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
  return new GitlabClient(host, fetchMock.fetchMock,
    new MockAuthModule() as AuthenticationModule, logger);
};

function genericArrangeProjectModule(status: number, body: any, path: string, options?: any) {
    const gitlabClient = getClient();
    const projectModule = new ProjectModule(
      {} as AuthenticationModule,
      {} as SystemHookModule,
      {} as LocalEventBus,
      gitlabClient,
      logger,
      '',
    );
    fetchMock.restore();
    fetchMock.mock(
      `${host}${gitlabClient.apiPrefix}${path}`,
      { status, body }, options);
    return projectModule;
}

async function expectServerError(functionToRun: () => any) {
   let failed = false;
   try {
     await functionToRun();
     failed = true;
   } catch (err) {
      expect((err as Boom.BoomError).isBoom).to.equal(true);
      expect((err as Boom.BoomError).isServer).to.equal(true);
   }
   if (failed) {
     expect.fail('should throw');
   }
}

const gitBaseUrl = 'http://foo.git.com';

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

describe('project-module', () => {

  describe('getBranch()', () => {

    const projectId = 3;
    const branchName = 'master';

    const gitlabResponse = {
      'name': 'master',
      'protected': true,
      'developers_can_push': false,
      'developers_can_merge': false,
      'commit': {
        'author_email': 'john@example.com',
        'author_name': 'John Smith',
        'authored_date': '2012-06-27T05:51:39-07:00',
        'committed_date': '2012-06-28T03:44:20-07:00',
        'committer_email': 'john@example.com',
        'committer_name': 'John Smith',
        'id': '7b5c3cc8be40ee161ae89a06bba6229da1032a0c',
        'message': 'add projects API',
        'parent_ids': [
          '4ad91d3c1144c406e50c7b33bae684bd6837faf8',
        ],
      },
    };

    it('should work correcly gitlab responds with a branch', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(200, gitlabResponse,
        `/projects/${projectId}/repository/branches/${branchName}`);

      // Act
      const branch = await projectModule.getBranch(projectId, branchName);

      // Assert
      expect(branch).to.exist;
      expect(branch!.name).to.equal(branchName);
      expect(branch!.latestCommit).to.exist;
      expect(branch!.latestCommit.id).to.equal(gitlabResponse.commit.id);
      expect(branch!.latestCommit.author.email).to.equal(gitlabResponse.commit.author_email);
      expect(branch!.latestActivityTimestamp).to.equal(gitlabResponse.commit.committed_date);
    });

    it('should return null when gitlab responds 404', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(404, { },
        `/projects/${projectId}/repository/branches/${branchName}`);

      // Act
      const branch = await projectModule.getBranch(projectId, branchName);

      // Assert
      expect(branch).to.equal(null);
    });

    it('should throw if gitlab responds 500', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(500, { },
        `/projects/${projectId}/repository/branches/${branchName}`);

      // Act & Assert
      await expectServerError(async () => await projectModule.getBranch(projectId, branchName));
    });

  });

  describe('getProject()', () => {

    const contributors = [{
      name: 'foo',
      email: 'foo@foomail.com',
    }];

    function arrangeProjectModule(status: number, body: any) {
      const gitlabClient = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        gitlabClient,
        logger,
        '',
        );
      fetchMock.restore();
      fetchMock.mock(
        `${host}${gitlabClient.apiPrefix}/projects/3`,
        { status, body });
      projectModule.getProjectContributors = async (projectId: number) => {
        expect(projectId).to.equal(3);
        return contributors;
      };
      return projectModule;
    }

    it('should respond with correct fields when gitlab response is ok', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabProjectResponse);

      // Act
      const project = await projectModule.getProject(3) as MinardProject;

      // Assert
      expect(project.id).to.equal(3);
      expect(project.name).to.equal('Diaspora Project Site');
      expect(project.description).to.equal(gitlabProjectResponse.description);
      expect(project.latestActivityTimestamp).to.equal(gitlabProjectResponse.last_activity_at);
      expect(project.activeCommitters).to.exist;
      expect(project.activeCommitters).to.have.length(1);
      expect(project.activeCommitters[0].name).to.equal(contributors[0].name);
    });

    it('should return null if gitlab responds with not found', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, { msg: 'not found'});

      // Act
      const project = await projectModule.getProject(3);

      // Assert
      expect(project).to.equal(null);
    });

    it('should throw if gitlab responds with error code 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500, { msg: 'not found'});

      // Act & Assert
      await expectServerError(async () => await projectModule.getProject(3));
    });

  });

  describe('getProjects()', () => {
    const teamId = gitlabProjectResponse.namespace.id;
    const gitlabResponse = [gitlabProjectResponse];
    const path = `/groups/${teamId}/projects`;

    const contributors = [{
      name: 'foo',
      email: 'foo@foomail.com',
    }];

    it('should work when gitlab returns a valid project', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(200, gitlabResponse, path);
      projectModule.getProjectContributors = async (_projectId: number) => {
        expect(_projectId).to.equal(gitlabProjectResponse.id);
        return contributors;
      };

      // Act
      const projects = await projectModule.getProjects(teamId);

      // Assert
      expect(projects![0].teamId).to.equal(teamId);
      expect(projects![0].id).to.equal(3);
      expect(projects![0].name).to.equal('Diaspora Project Site');
      expect(projects![0].activeCommitters).to.exist;
      expect(projects![0].activeCommitters).to.have.length(1);
      expect(projects![0].activeCommitters[0].name).to.equal(contributors[0].name);
    });

    it('should throw if cannot fetch contributors', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(200, gitlabResponse, path);
      projectModule.getProjectContributors = async (_projectId: number) => {
        expect(_projectId).to.equal(gitlabProjectResponse.id);
        throw Boom.badGateway();
      };
      // Act && Assert
      await expectServerError(async () => await projectModule.getProjects(teamId));
    });

    it('should throw if gitlab returns status 500', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(500, gitlabResponse, path);
      projectModule.getProjectContributors = async (_projectId: number) => {
        expect(_projectId).to.equal(gitlabProjectResponse.id);
        return contributors;
      };
      // Act && Assert
      await expectServerError(async () => await projectModule.getProjects(teamId));
    });

    it('should return null if gitlab returns status 404', async () => {
      // Arrange
      const projectModule = genericArrangeProjectModule(404, gitlabResponse, path);

      // Act
      const projects = await projectModule.getProjects(teamId);

      // Assert
      expect(projects).to.equal(null);
    });

  });

  describe('getProjectBranches()', () => {

    const projectId = 5;
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

    function arrangeProjectModule(status: number, body: any) {
      return genericArrangeProjectModule(status, body, `/projects/${projectId}/repository/branches`);
    }

    it('should provide valid branches when gitlab responds with two branches', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabBranchesResponse);

      // Act
      const branches = await projectModule.getProjectBranches(projectId);

      // Assert
      expect(branches).to.exist;
      expect(branches).to.have.length(2);
      expect(branches![0].name).to.equal(gitlabBranchesResponse[0].name);
      expect(branches![1].name).to.equal(gitlabBranchesResponse[1].name);
    });

    it('should return null if gitlab responds with not found (404)', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, { msg: 'not found' });

      // Act
      const branches = await projectModule.getProjectBranches(projectId);

      // Assert
      expect(branches).to.equal(null);
    });

    it('should throw if gitlab responds with status 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500, { msg: 'internal server error' });

      // Act & Assert
      await expectServerError(async () => projectModule.getProjectBranches(projectId));
    });

  });

  describe('fetchBranchCommits', () => {

    const projectId = 5;
    const branchName = 'foo';
    const gitlabResponse = [
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

    const until = moment();
    const count = 2;
    const params = {
      per_page: count,
      ref_name: branchName,
      until: toGitlabTimestamp(until),
    };

    function arrangeProjectModule(status: number, _body: any) {
      return genericArrangeProjectModule(status, gitlabResponse,
        `/projects/${projectId}/repository/commits?${queryString.stringify(params)}`);
    }

    it('should work when gitlab responds with two commits', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabResponse);

      // Act
      const commits = await projectModule.fetchBranchCommits(projectId, branchName, until, count);

      // Assert
      expect(commits).to.exist;
      expect(commits).to.have.length(2);
      expect(commits![0].id).to.equal(gitlabResponse[0].id);
    });

    it('should return null if gitlab responds 404', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, { msg: 'not found'} );

      // Act
      const commits = await projectModule.fetchBranchCommits(projectId, branchName, until, count);

      // Assert
      expect(commits).to.equal(null);
    });

    it('should throw if gitlab responds 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500, { msg: 'not found'} );

      // Act & Assert
      await expectServerError(async () => await projectModule.fetchBranchCommits(projectId, branchName, until, count));
    });

  });

  describe('getBranchCommits', () => {

    const projectId = 5;
    const branchName = 'foo';
    const count = 2;
    const extraCount = 2;
    const until = moment();

    function arrangeProjectModule(fetchResult: any[]) {
      const projectModule = new ProjectModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        '',
        );
      let called = false;

      projectModule.fetchBranchCommits = async (
        _projectId: number, _branchName: string, _until: moment.Moment, _count: number) => {
        expect(called).to.equal(false, 'fetchBranchCommits should only be called once');
        expect(_projectId).to.equal(projectId);
        expect(_branchName).to.equal(branchName);
        expect(_count).to.equal(count + extraCount);
        expect(_until.isSame(until)).to.equal(true);
        called = true;
        return fetchResult;
      };
      return projectModule;
    }

    it('should work when fetch returns single commit with a matching timestamp and 3 others', async () => {
      const fetchResult = [
        {
          created_at: until,
        },
        {
          created_at: moment().add(1, 'days'),
        },
        {
          created_at: moment().add(2, 'days'),
        },
        {
          created_at: moment().add(3, 'days'),
        },
      ];
      const projectModule = arrangeProjectModule(fetchResult);

      // Act
      const commits = await projectModule.getBranchCommits(projectId, branchName, until, count, extraCount);

      expect(commits).to.exist;
      expect(commits).to.have.length(3);
    });

    it('should work when fetch returns two commits with a matching timestamp and 2 others', async () => {
      const fetchResult = [
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: moment().add(1, 'days'),
          },
          {
            created_at: moment().add(2, 'days'),
          },
        ];
      const projectModule = arrangeProjectModule(fetchResult);

      // Act
      const commits = await projectModule.getBranchCommits(projectId, branchName, until, count, extraCount);

      expect(commits).to.exist;
      expect(commits).to.have.length(4);
    });

    it('should work when fetch returns only one extra commit', async () => {
      const fetchResult = [
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: moment().add(1, 'days'),
          },
        ];
      const projectModule = arrangeProjectModule(fetchResult);

      // Act
      const commits = await projectModule.getBranchCommits(projectId, branchName, until, count, extraCount);

      expect(commits).to.exist;
      expect(commits).to.have.length(3);
    });

    it('should work when first fetch has three commit with timestamp matching until and one extra', async () => {
      const fetchResult1 = ([
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: moment().add(1, 'days'),
          },
        ] as any ) as Commit[];
      const fetchResult2 = ([
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: until,
          },
          {
            created_at: moment().add(1, 'days'),
          },
          {
            created_at: moment().add(2, 'days'),
          },
          {
            created_at: moment().add(3, 'days'),
          },
          {
            created_at: moment().add(4, 'days'),
          },
        ] as any) as Commit[];
      const projectModule = new ProjectModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        '',
        );
      projectModule.fetchBranchCommits = async (
        _projectId: number, _branchName: string, _until: moment.Moment, _count: number) => {
        expect(_projectId).to.equal(projectId);
        expect(_branchName).to.equal(branchName);
        if (_count === count + extraCount) {
          return fetchResult1;
        }
        if (_count === count + extraCount + 100) {
          return fetchResult2;
        }
        throw Error(`Unexpected _count in call to fetchBranchCommits: ${_count}`);
      };

      // Act
      const commits = await projectModule.getBranchCommits(projectId, branchName, until, count, extraCount);

      expect(commits).to.exist;
      expect(commits).to.have.length(5);
    });

  });

  describe('getCommit()', () => {

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

    function arrangeProjectModule(status: number, body: any) {
      return genericArrangeProjectModule(status, body,
        `/projects/3/repository/commits/6104942438c14ec7bd21c6cd5bd995272b3faff6`);
    }

    it('should return valid commit when receiving valid response from GitLab', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabCommitResponse);

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

    it('should return null when gitlab responds 404', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, { });

      // Act
      const commit = await projectModule.getCommit(3, '6104942438c14ec7bd21c6cd5bd995272b3faff6') as MinardCommit;

      // Assert
      expect(commit).to.equal(null);
    });

    it('should throw when gitlab responds 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500, { });

      // Act && Assert
      await expectServerError(async () => await projectModule.getCommit(3, '6104942438c14ec7bd21c6cd5bd995272b3faff6'));
    });

  });

  describe('getProjectContributors()', () => {

    const projectId = 5;

    const gitlabResponse = [
      {
        'name': 'Dmitriy Zaporozhets',
        'email': 'dmitriy.zaporozhets@gmail.com',
        'commits': 117,
        'additions': 2097,
        'deletions': 517,
      },
      {
        'name': 'Jacob Vosmaer',
        'email': 'contact@jacobvosmaer.nl',
        'commits': 33,
        'additions': 338,
        'deletions': 244,
      },
    ];

    function arrangeProjectModule(status: number, body: any) {
      const gitlabClient = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        {} as LocalEventBus,
        gitlabClient,
        logger,
        '',
        );
      fetchMock.restore().mock(
        `${host}${gitlabClient.apiPrefix}/projects/${projectId}/repository/contributors`,
        { status, body });
      return projectModule;
    }

    it('should return correct value when receiving gitlab response with two contributors', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabResponse);

      // Act
      const committers = await projectModule.getProjectContributors(projectId);

      // Assert
      expect(committers).to.exist;
      expect(committers!.length).to.equal(2);
      expect(committers![0].name).to.equal(gitlabResponse[0].name);
      expect(committers![0].email).to.equal(gitlabResponse[0].email);
    });

    it('should return [] when gitlab returns 404', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, gitlabResponse);

      // Act
      const committers = await projectModule.getProjectContributors(projectId);

      // Assert
      expect(committers).to.have.length(0);
    });

    it('should throw when gitlab returns 500', async() => {
      // Arrange
      const projectModule = arrangeProjectModule(500, gitlabResponse);

      // Act & Assert
      await expectServerError(async () => await projectModule.getProjectContributors(projectId));
    });

  });

  function prepareProjectModule(status: number, body: any, url: string, method: string, eventBus?: EventBus) {
    const bus = eventBus || new LocalEventBus();
    const client = getClient();
    const projectModule = new ProjectModule(
      {} as AuthenticationModule,
      {} as SystemHookModule,
      bus,
      client,
      logger,
      gitBaseUrl,
    );
    const mockUrl = `${host}${client.apiPrefix}${url}`;
    fetchMock.restore().mock(
      mockUrl,
      {
        status,
        body,
      },
      {
        method,
      },
    );
    return projectModule;
  }

  describe('doCreateProjectFromTemplate()', () => {
    const projectId = 11;
    const projectName = 'foo-project-name';
    const description = 'foo project description';
    const templateProjectId = 10;
    const templateProjectPath = 'bar-project-name';
    const teamId = 5;
    const namespacePath = 'foo-namespace';
    const rootPassword = 'foo-password';

    function arrangeProjectModule(bus: LocalEventBus = new LocalEventBus()) {
      const gitlab = new GitlabClient(
        '',
        {} as any,
        {} as any,
        {} as any,
        false);
      const authenticationModule = new AuthenticationModule({} as any, rootPassword);
      const projectModule = new ProjectModule(
        authenticationModule,
        {} as any,
        bus,
        gitlab,
        logger,
        '',
        );
      projectModule.failSleepTime = 0;
      projectModule.createGitlabProject = async (
        _teamId: number, _path: string, _description: string, _importUrl: string) => {
        expect(_teamId).to.equal(teamId);
        expect(_path).to.equal(_path);
        expect(_description).to.equal(description);
        expect(_importUrl).to.equal('http://root:foo-password@localhost/foo-namespace/bar-project-name.git');
        return {
          id: projectId,
        };
      };
      return projectModule;
    }

    it('it should return id and create event when project creation is succesful ', async () => {
      // Arrange
      const bus = new LocalEventBus();
      const projectModule = arrangeProjectModule(bus);
      let callCount = 0;
      projectModule.getProject = async (_projectId: number) => {
        callCount++;
        if (callCount === 1) {
          expect(_projectId).to.equal(templateProjectId);
          return {
            namespacePath,
            path: templateProjectPath,
            defaultBranch: 'master',
          } as MinardProject;
        }
        if (callCount === 2) {
          expect(_projectId).to.equal(projectId);
          return {
            defaultBranch: null,
          } as any;
        }
        if (callCount === 3) {
          expect(_projectId).to.equal(projectId);
          return {
            defaultBranch: 'master',
            id: projectId,
          };
        }
        throw Error('callCount should not go over 2');
      };

      const promise = bus.filterEvents<ProjectCreatedEvent>(PROJECT_CREATED_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();

      // Act
      const createdProjectId = await projectModule.doCreateProjectFromTemplate(
        templateProjectId, teamId, projectName, description);

      // Assert
      const payload = await promise;
      expect(payload.teamId).to.equal(teamId);
      expect(payload.description).to.equal(description);
      expect(payload.name).to.equal(projectName);
      expect(payload.id).to.equal(projectId);
      expect(createdProjectId).to.equal(createdProjectId);
    });

    it('should throw if project never acquires default branch', async () => {
      // Arrange
      const projectModule = arrangeProjectModule();
      let callCount = 0;
      projectModule.getProject = async (_projectId: number) => {
        callCount++;
        if (callCount === 1) {
          expect(_projectId).to.equal(templateProjectId);
          return {
            namespacePath,
            path: templateProjectPath,
            defaultBranch: 'master',
          } as MinardProject;
        }
        expect(_projectId).to.equal(projectId);
        return {
          defaultBranch: null,
        } as any;
      };

      // Act
      let error: Boom.BoomError | undefined;
      await projectModule.doCreateProjectFromTemplate(
        templateProjectId, teamId, projectName, description)
        .catch((err) => error = err as Boom.BoomError);

      // Assert
      expect(error).to.exist;
      expect(error!.isBoom).to.equal(true);
      expect(error!.message).to.equal('never-acquired-default-branch');
      expect(error!.isServer).to.equal(true);
    });

    it('should throw if project be copied does not include default branch', async () => {
      // Arrange
      const projectModule = arrangeProjectModule();
      projectModule.getProject = async (_projectId: number) => {
        expect(_projectId).to.equal(templateProjectId);
        return {
          namespacePath,
          path: templateProjectPath,
          defaultBranch: null,
        } as any;
      };

      // Act
      let error: Boom.BoomError | undefined;
      await projectModule.doCreateProjectFromTemplate(
        templateProjectId, teamId, projectName, description)
        .catch((err) => error = err as Boom.BoomError);

      // Assert
      expect(error).to.exist;
      expect(error!.isBoom).to.equal(true);
      expect(error!.output.statusCode).to.equal(MINARD_ERROR_CODE.BAD_REQUEST);
      expect(error!.message).to.equal('Cannot use an empty project as template');
    });
  });

  describe('doCreateProject()', () => {
    const projectId = 10;
    const teamId = 5;
    const name = 'foo-project';
    const path = name;
    const description = 'my foo project';

    function arrangeProjectModule(status: number, body: any, eventBus?: EventBus) {
      const params = {
        name,
        path: name,
        public: false,
        description,
        namespace_id: teamId,
      };
      const url = `/projects?${queryString.stringify(params)}`;
      return prepareProjectModule(status, body, url, 'POST', eventBus);
    }

    it('should work when gitlab project creation is successful', async () => {
      // Arrange
      const bus = new LocalEventBus();
      const promise = bus.filterEvents<ProjectCreatedEvent>(PROJECT_CREATED_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();
      const projectModule = arrangeProjectModule(201, { id: projectId, path }, bus);

      const projectHookPromise = new Promise((resolve, _reject) => {
        projectModule.assureProjectHookRegistered = async (_projectId: number) => {
          resolve(_projectId);
        };
      });

      // Act
      const id = await projectModule.doCreateProject(teamId, name, description);
      const payload = await promise;

      // Assert
      expect(id).to.equal(projectId);
      expect(payload.description).to.equal(description);
      expect(payload.id).to.equal(projectId);
      expect(payload.teamId).to.equal(teamId);
      expect(payload.name).to.equal(name);
      expect(await projectHookPromise).to.equal(projectId);
    });

    it('should throw server error when gitlab response status is not 201', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, { id: projectId, path });

      // Act & Assert
      await expectServerError(async () => await projectModule.doCreateProject(teamId, name, description));
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
        await projectModule.doCreateProject(teamId, name, description);
        expect.fail('should throw');
      } catch (err) {
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(false);
        expect(err.data).to.equal('name-already-taken');
      }
    });

    it('should throw if gitlab response is missing project id', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(201, { foo: 'bar', path });

      // Act & Assert
      await expectServerError(async () => await projectModule.doCreateProject(teamId, name, description));
    });

    it('should throw if gitlab response has invalid project path', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(201, { foo: 'bar', path: 'foo' });

      // Act & Assert
      await expectServerError(async () => await projectModule.doCreateProject(teamId, name, description));
    });
  });

  describe('deleteProject()', () => {
    const projectId = 10;
    const teamId = 5;
    function arrangeProjectModule(status: number, body: any, eventBus?: EventBus) {
      const bus = eventBus || new LocalEventBus();
      const client = getClient();
      const projectModule = new ProjectModule(
        {} as AuthenticationModule,
        {} as SystemHookModule,
        bus,
        client,
        logger,
        '',
          );
      projectModule.getProject = async (_projectId: number) => {
        expect(_projectId).to.equal(projectId);
        return {
          teamId,
        } as MinardProject;
      };
      const mockUrl = `${host}${client.apiPrefix}/projects/${projectId}`;
      fetchMock.restore().mock(
        mockUrl,
        {
          status,
          body,
        },
        {
          method: 'DELETE',
        },
      );
      return projectModule;
    }

    it('should create deleted event when gitlab project deletion is successful', async () => {
      // Arrange
      const bus = new LocalEventBus();
      const promise = bus.filterEvents<ProjectDeletedEvent>(PROJECT_DELETED_EVENT_TYPE)
        .take(1)
        .toPromise();
      const projectModule = arrangeProjectModule(200, 'true', bus);

      // Act
      await projectModule.deleteProject(projectId);
      const event = await promise;

      // Assert
      expect(event.payload.id).to.equal(projectId);
      expect(event.payload.teamId).to.equal(teamId);
    });

    it('should throw when gitlab responds with invalid status code', async () => {
      const projectModule = arrangeProjectModule(201, 'true');
     // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(true);
      }
    });

    it('should throw when gitlab responds with invalid response body', async () => {
      const projectModule = arrangeProjectModule(200, 'foo');
     // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(true);
      }
    });

    it('should throw 404 when gitlab responds that project was not found', async () => {
      const projectModule = arrangeProjectModule(404,
        {
          message: '404 Project Not Found',
        },
      );
      // Act & Assert
      try {
        await projectModule.deleteProject(projectId);
        expect.fail('should throw');
      } catch (err) {
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(false);
        expect((err as Boom.BoomError).output.statusCode).to.equal(404);
      }
    });

  });

  describe('editProject()', () => {

    const teamId = 5;
    const projectId = 10;
    const name = 'foo-project';
    const path = name;
    const description = 'my foo project';
    const oldName = 'old-foo-project';
    const oldDescription = 'old-foo-project-description';

    function arrangeProjectModule(
      status: number,
      params: any,
      eventBus?: EventBus,
      body?: any) {
      const url = `/projects/${projectId}?${queryString.stringify(params)}`;
      return prepareProjectModule(status, body, url, 'PUT', eventBus);
    }

    async function shouldSucceed(
      attributes: { name?: string, description?: string },
      resultingName: string, resultingDescription: string) {
      const bus = new LocalEventBus();
      const promise = bus.filterEvents<ProjectEditedEvent>(PROJECT_EDITED_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();
      const params = {
        name: attributes.name,
        path: attributes.name,
        description: attributes.description,
      };
      const body = {
        id: projectId,
        name: resultingName,
        path: resultingName,
        description: resultingDescription,
        'namespace': {
          id: teamId,
          path: 'foo-path',
        },
      };
      const projectModule = arrangeProjectModule(200, params, bus, body);

      // Act
      await projectModule.editProject(projectId, attributes);
      const payload = await promise;

      // Assert
      expect(fetchMock.called()).to.equal(true);
      expect(payload.description).to.equal(resultingDescription);
      expect(payload.id).to.equal(projectId);
      expect(payload.name).to.equal(resultingName);
      expect(payload.teamId).to.equal(teamId);
      expect(payload.repoUrl).to.equal(`${gitBaseUrl}/foo-path/${resultingName}.git`);
    }

    it('should work when editing all editable fields', async () => {
      await shouldSucceed({ name, description }, name, description);
    });

    it('should work when editing only project name', async () => {
      await shouldSucceed({ name }, name, oldDescription);
    });

    it('should work when editing only project description', async () => {
      await shouldSucceed({ description }, oldName, description);
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
      const params = { name, path, description };
      const projectModule = arrangeProjectModule(400, params, undefined, response);
      // Act & Assert
      try {
        await projectModule.editProject(projectId, { name, description });
        expect.fail('should throw');
      } catch (err) {
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(false);
        expect(err.data).to.equal('name-already-taken');
      }
    });

    async function shouldThrowIfInvalid(status: number, invalidFieldName?: string) {
      const bus = new LocalEventBus();
      // Arrange
      const response = {
        id: projectId,
        name,
        path,
        description,
      } as any;
      if (invalidFieldName) {
        response[invalidFieldName] = 'foo-foo-foo';
      }
      const params = { name, path, description };
      const projectModule = arrangeProjectModule(status, params, bus, response);
      // Act & Assert
      try {
        await projectModule.editProject(projectId, { name, description });
        expect.fail('should throw');
      } catch (err) {
        expect(fetchMock.called()).to.equal(true);
        expect((err as Boom.BoomError).isBoom).to.equal(true);
        expect((err as Boom.BoomError).isServer).to.equal(true);
      }
    }

    it('should throw if gitlab response has invalid status code', async () => {
      await shouldThrowIfInvalid(205, 'id');
    });

    it('should throw if gitlab response has invalid project id', async () => {
      await shouldThrowIfInvalid(200, 'id');
    });

    it('should throw if gitlab response has invalid project name', async () => {
      await shouldThrowIfInvalid(200, 'name');
    });

    it('should throw if gitlab response has invalid project path', async () => {
      await shouldThrowIfInvalid(200, 'path');
    });

  });

  function arrangeProjectModuleForProjectHookTest(
    status: number, body: any, path: string, options?: any) {
    const gitlabClient = getClient();
    const systemHookModule = {} as SystemHookModule;
    systemHookModule.getUrl = (_path: string) => `http://foo-bar.com${_path}`;
    const projectModule = new ProjectModule(
      {} as AuthenticationModule,
      systemHookModule,
      {} as LocalEventBus,
      gitlabClient,
      logger,
      '',
    );
    fetchMock.restore();
    fetchMock.mock(
      `${host}${gitlabClient.apiPrefix}${path}`,
      {
        status,
        body,
      },
      options,
    );
    return projectModule;
  }

  describe('registerProjectHook', () => {
    const projectId = 5;
    const gitlabResponse = {
      'id': 41,
      'url': 'http://foo-bar.com/project/project-hook',
      'created_at': '2016-09-13T17:38:15.494+05:30',
      'project_id': projectId,
      'push_events': true,
      'issues_events': false,
      'merge_requests_events': false,
      'tag_push_events': false,
      'note_events': false,
      'build_events': true,
      'enable_ssl_verification': true,
    };

    function arrangeProjectModule(status: number) {
      const params = {
        url: gitlabResponse.url,
        push_events: true,
      };
      const path = `/projects/${projectId}/hooks?${queryString.stringify(params)}`;
      return arrangeProjectModuleForProjectHookTest(status, gitlabResponse, path, { method: 'POST' });
    }

    it('should succeed', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(201);

      // Act
      await projectModule.registerProjectHook(projectId);

      // Assert
      expect(fetchMock.called()).to.equal(true);
    });

    it('should throw if gitlab responds 404', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404);
      await projectModule.registerProjectHook(projectId).then(
        () => expect.fail('should throw'),
        (err) => {
          expect((err as Boom.BoomError).isBoom).to.equal(true);
          expect((err as Boom.BoomError).isServer).to.equal(false);
        });
    });

    it('should throw if gitlab responds 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500);
      await projectModule.registerProjectHook(projectId).then(
        () => expect.fail('should throw'),
        (err) => {
          expect((err as Boom.BoomError).isBoom).to.equal(true);
          expect((err as Boom.BoomError).isServer).to.equal(true);
        });
    });
  });

  describe('fetchProjectHooks', () => {
    const projectId = 5;
    const gitlabResponse = [
      {
        'id': 41,
        'url': 'http://foobar.com',
        'created_at': '2016-09-13T17:38:15.494+05:30',
        'project_id': 2,
        'push_events': true,
        'issues_events': false,
        'merge_requests_events': false,
        'tag_push_events': false,
        'note_events': false,
        'build_events': true,
        'enable_ssl_verification': true,
      },
      {
        'id': 40,
        'url': 'http://foobar.com',
        'created_at': '2016-09-13T17:26:42.043+05:30',
        'project_id': 2,
        'push_events': true,
        'issues_events': false,
        'merge_requests_events': false,
        'tag_push_events': false,
        'note_events': false,
        'build_events': true,
        'enable_ssl_verification': true,
      },
    ];

    function arrangeProjectModule(status: number, body: any) {
      const path = `/projects/${projectId}/hooks`;
      return arrangeProjectModuleForProjectHookTest(status, body, path);
    }

    it('should return hooks when gitlab responds with two hooks', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabResponse);

      // Act
      const hooks = await projectModule.fetchProjectHooks(projectId);

      // Assert
      expect(hooks).to.exist;
      expect(hooks).to.have.length(2);
      expect(hooks).to.deep.equal(gitlabResponse);
    });

    it('should throw if response is not array', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(200, gitlabResponse[0]);

      // Act & Assert
      await projectModule.fetchProjectHooks(projectId).then(
        () => expect.fail('should throw'),
        (err) => {
          expect((err as Boom.BoomError).isBoom).to.equal(true);
          expect((err as Boom.BoomError).isServer).to.equal(true);
        });
    });

    it('should throw if gitlab responds 404', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(404, gitlabResponse);

      // Act & Assert
      await projectModule.fetchProjectHooks(projectId).then(
        () => expect.fail('should throw'),
        (err) => {
          expect((err as Boom.BoomError).isBoom).to.equal(true);
          expect((err as Boom.BoomError).isServer).to.equal(false);
        });
    });

    it('should throw if gitlab responds 500', async () => {
      // Arrange
      const projectModule = arrangeProjectModule(500, gitlabResponse);

      // Act & Assert
      await projectModule.fetchProjectHooks(projectId).then(
        () => expect.fail('should throw'),
        (err) => {
          expect((err as Boom.BoomError).isBoom).to.equal(true);
          expect((err as Boom.BoomError).isServer).to.equal(true);
        });
    });

  });

  describe('assureProjectHookRegistered', () => {
    const projectId = 5;
    const gitlabResponse = [{
      'id': 41,
      'url': 'http://foo-bar.com/project/project-hook',
      'created_at': '2016-09-13T17:38:15.494+05:30',
      'project_id': projectId,
      'push_events': true,
      'issues_events': false,
      'merge_requests_events': false,
      'tag_push_events': false,
      'note_events': false,
      'build_events': true,
      'enable_ssl_verification': true,
    }];

    it(
      'should not register project hook if one does already exists for this project and correct url',
      async () => {
      // Arrange
      const path = `/projects/${projectId}/hooks`;
      const projectModule = arrangeProjectModuleForProjectHookTest(200, gitlabResponse, path);

      // Act & Assert
      let called = false;
      projectModule.registerProjectHook = async (_projectId: number) => {
        called = true;
      };
      await projectModule.assureProjectHookRegistered(projectId);
      expect(called).to.equal(false);
    });

    it('should register project hook if existing one differs by webhook url', async () => {
      // Arrange
      const path = `/projects/${projectId}/hooks`;
      const body = gitlabResponse.map(item => ({ ...item, url: 'foo' }));
      const projectModule = arrangeProjectModuleForProjectHookTest(200, body, path);

      // Act & Assert
      const promise = new Promise((resolve, _reject) => {
        projectModule.registerProjectHook = async (_projectId: number) => {
          expect(_projectId).to.equal(projectId);
          resolve();
        };
      });
      await projectModule.assureProjectHookRegistered(projectId);
      await promise;
    });
  });

  describe('assureProjectHooksRegistered', () => {
    it('should call assureProjectHooksRegistered for all projectIds', async () => {
      const projectIds = [2, 3];
      const projectModule = new ProjectModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        logger,
        '',
        );
      projectModule.getAllProjectIds = async () => projectIds;

      let callCount = 0;
      projectModule.assureProjectHookRegistered = async (projectId: number) => {
        expect(projectId).to.equal(projectIds[callCount]);
        callCount++;
      };

      await projectModule.assureProjectHooksRegistered();
      expect(callCount).to.equal(2);
    });

    it('should retry if assureProjectHooksRegistered fails', async () => {
      // Arrange
      const projectIds = [2];
      const projectModule = new ProjectModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        logger,
        '',
        );
      projectModule.failSleepTime = 10;
      projectModule.getAllProjectIds = async () => projectIds;

      // Act & Assert
      let callCount = 0;
      projectModule.assureProjectHookRegistered = async (projectId: number) => {
        expect(projectId).to.equal(projectIds[0]);
        callCount++;
        if (callCount === 1) {
          throw Error();
        }
      };
      await projectModule.assureProjectHooksRegistered();
      expect(callCount).to.equal(2);
    });
  });

  describe('receiveProjectHook', () => {

    const gitlabPayload = {
      'object_kind': 'push',
      'before': 'before-commit-hash',
      'after': 'after-commit-hash',
      'ref': 'refs/heads/master',
      'project_id': 15,
      'commits': [
        {
          'id': 'first-commit-hash',
        },
        {
          'id': 'second-commit-hash',
        },
        {
          'id': 'null-commit-hash',
        },
      ],
    } as GitlabPushEvent;

    const teamId = 6;

    it('should produce correct event', async () => {
      // Arrange
      const bus = new LocalEventBus();
      const projectModule = new ProjectModule(
        {} as any,
        {} as any,
        bus,
        {} as any,
        logger,
        '',
        );

      projectModule.getCommit = async (_projectId: number, sha: string) => {
        expect(_projectId).to.equal(gitlabPayload.project_id);
        if (sha === 'null-commit-hash') {
          return null;
        }
        if (sha === 'first-commit-hash') {
          return {
            id: sha,
            parentIds: ['first-parent-hash', 'second-parent-hash', 'null-commit-hash'],
          };
        }
        return {
          id: sha,
        };
      };

      projectModule.getProject = async (_projectId: number) => {
        expect(_projectId).to.equal(gitlabPayload.project_id);
        return {
          teamId,
        } as MinardProject;
      };

      const promise = bus.filterEvents<CodePushedEvent>(CODE_PUSHED_EVENT_TYPE)
        .map(event => event.payload)
        .take(1)
        .toPromise();

      // Act
      await projectModule.receiveProjectHook(gitlabPayload);
      const event = await promise;

      // Assert
      expect(event.teamId).to.equal(teamId);
      expect(event.projectId).to.equal(gitlabPayload.project_id);
      expect(event.ref).to.equal('master');
      expect(event.after!.id).to.equal(gitlabPayload.after);
      expect(event.before!.id).to.equal(gitlabPayload.before);
      expect(event.commits).to.have.length(2);
      expect(event.commits[0]!.id).to.equal(gitlabPayload.commits[0].id);
      expect(event.commits[1]!.id).to.equal(gitlabPayload.commits[1].id);
      expect(event.parents).to.have.length(2);
      expect(event.parents![0]!.id).to.equal('first-parent-hash');
      expect(event.parents![1]!.id).to.equal('second-parent-hash');
    });

  });

});
