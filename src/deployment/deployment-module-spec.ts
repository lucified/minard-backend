
import 'reflect-metadata';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { expect } from 'chai';

import {
  DEPLOYMENT_EVENT_TYPE, DeploymentEvent, DeploymentModule,
  createDeploymentEvent, getDeploymentKey,
} from './';

import Authentication from '../authentication/authentication-module';
import EventBus from '../event-bus/local-event-bus';
import { IFetchStatic } from '../shared/fetch.d.ts';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';

const fetchMock = require('fetch-mock');
const rimraf = require('rimraf');

const host = 'gitlab';
const token = 'the-sercret';

declare var Response: any;

const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return token;
    }
  }
  return new GitlabClient(host, fetchMock.fetchMock as IFetchStatic,
    new MockAuthModule() as Authentication, {} as any);
};

const logger = Logger(undefined, true);
const eventBus = new EventBus();

const getDeploymentModule = (client: GitlabClient, path: string) => new DeploymentModule(
  client,
  path,
  eventBus,
  logger
);

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

const gitlabBuildResponse = {
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
  'status': 'success',
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
};

describe('deployment-module', () => {
  describe('getDeployment()', () => {
    it('should work when deployment can be found', async () => {
      // Arrange
      const gitlabClient = getClient();
      const response = {
        status: 200,
        body: gitlabBuildResponse,
      };
      fetchMock.restore().mock(`${host}${gitlabClient.apiPrefix}/projects/1/builds/4`, response);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      const deployment = await deploymentModule.getDeployment(1, 4);
      // Assert
      expect(deployment).to.not.equal(null);
      expect(deployment!.id).to.equal(8);
      expect(deployment!.url).to.equal('http://master-0ff3ae19-1-8.localhost:8000');
      expect(deployment!.creator.email).to.equal(gitlabBuildResponse.commit.author_email);
      expect(deployment!.creator.name).to.equal(gitlabBuildResponse.commit.author_name);
      expect(deployment!.creator.timestamp).to.equal(gitlabBuildResponse.finished_at);
    });

    it('should return null when deployment can not be found', async () => {
      // Arrange
      const gitlabClient = getClient();
      // (this is how gitlab actually responds)
      const responseObject = {
        status: 404,
        body: { message: '404 Not Found' },
      };
      fetchMock.restore().mock(`${host}${gitlabClient.apiPrefix}/projects/1/builds/4`, responseObject);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      const deployment = await deploymentModule.getDeployment(1, 4);
      // Assert
      expect(deployment).to.equal(null);
    });
  });

  describe('getDeployments()', () => {
    it('it should work with response returning two deployments', async () => {
      // Arrange
      const gitlabClient = getClient();
      fetchMock.restore().mock(`${host}${gitlabClient.apiPrefix}/projects/1/builds`, gitLabBuildsResponse);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      const deployments = await deploymentModule.getProjectDeployments(1);
      // Assert
      expect(deployments!.length).equals(2);
      expect(deployments![0].id).equals(gitLabBuildsResponse[0].id);
      expect(deployments![1].id).equals(gitLabBuildsResponse[1].id);
    });
  });

  describe('getCommitDeployments()', () => {
    it('it should work with response returning two deployments', async () => {
      // Arrange
      const sha = 'foo-commit-sha';
      const gitlabClient = getClient();
      fetchMock.restore().mock(
        `${host}${gitlabClient.apiPrefix}/projects/1/repository/commits/${sha}/builds`,
        gitLabBuildsResponse);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      const deployments = (await deploymentModule.getCommitDeployments(1, sha));
      // Assert
      expect(deployments).to.exist;
      expect(deployments!.length).equals(2);
      expect(deployments![0].id).equals(gitLabBuildsResponse[0].id);
      expect(deployments![1].id).equals(gitLabBuildsResponse[1].id);
    });
  });

  it('downloadAndExtractDeployment()', async () => {
    // Example URL for manual testing
    // http://localhost:10080/api/v3/projects/1/builds/3/artifacts\?private_token=BSKaHunLUSyxp_X-MK1a

    // Arrange
    rimraf.sync(path.join(os.tmpdir(), 'minard'));
    const thePath = path.join(__dirname, '../../src/deployment/test-artifact.zip');
    const stream = fs.createReadStream(thePath);
    const opts = {
      status: 200,
      statusText: 'ok',
    };
    const response = new Response(stream, opts);
    const gitlabClient = getClient();
    const mockUrl = `${host}${gitlabClient.apiPrefix}/projects/1/builds/2/artifacts`;
    fetchMock.restore().mock(mockUrl, response);
    const deploymentsDir = path.join(os.tmpdir(), 'minard', 'deploys');
    const deploymentModule = getDeploymentModule(gitlabClient, deploymentsDir);

    // Act
    const deploymentPath = await deploymentModule.downloadAndExtractDeployment(1, 2);

    // Assert
    const indexFilePath = path.join(deploymentPath, 'dist', 'index.html');
    expect(fs.existsSync(indexFilePath)).to.equal(true);
    expect(deploymentPath).to.equal(deploymentModule.getDeploymentPath(1, 2));
  });

  it('getDeploymentPath()', () => {
    const deploymentModule = getDeploymentModule({} as GitlabClient, 'example');
    const deploymentPath = deploymentModule.getDeploymentPath(1, 4);
    expect(deploymentPath).to.equal('example/1/4');
  });

  describe('prepareDeploymentForServing()', () => {

    it('should throw error when deployment not found', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (projectId, deploymentId) => {
        expect(projectId).to.equal(2);
        expect(deploymentId).to.equal(4);
        return null;
      };
      try {
        await deploymentModule.prepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        expect(err.message).to.equal('No deployment found for: projectId 2, deploymentId 4');
      }
    });

    it('should throw error when deployment status is not success', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (_projectId, _deploymentId) => {
        return {
          status: 'failed',
        };
      };
      try {
        await deploymentModule.prepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        expect(err.message).to.equal('Deployment status is "failed" for: projectId 2, deploymentId 4');
      }
    });

    it('should call downloadAndExtractDeployment when deployment is successful', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (_projectId, _deploymentId) => {
        return {
          status: 'success',
        };
      };
      let called = false;
      deploymentModule.downloadAndExtractDeployment = async (projectId, deploymentId) => {
        expect(projectId).to.equal(2);
        expect(deploymentId).to.equal(4);
        called = true;
      };
      await deploymentModule.prepareDeploymentForServing(2, 4);
      expect(called).to.equal(true);
    });

    it('should report internal error', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (_projectId, _deploymentId) => {
        return {
          status: 'success',
        };
      };
      deploymentModule.downloadAndExtractDeployment = async (_projectId, _deploymentId) => {
        throw Error('some error');
      };
      try {
        await deploymentModule.prepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        //
      }
    });

  });

  describe('getDeploymentKey()', () => {

    it('should match localhost hostname with single-digit ids', () => {
      const ret = getDeploymentKey('fdlkasjs-4-1.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(4);
      expect(ret.deploymentId).to.equal(1);
    });

    it('should match localhost hostname with multi-digit ids', () => {
      const ret = getDeploymentKey('fdlkasjs-523-2667.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(523);
      expect(ret.deploymentId).to.equal(2667);
    });

    it('should match minard.io hostname with multi-digit ids', () => {
      const ret = getDeploymentKey('fdlkasjs-145-3.minard.io');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(145);
      expect(ret.deploymentId).to.equal(3);
    });

    it('should not match non-matching hostnames', () => {
      const ret1 = getDeploymentKey('fdlkasjs-523-2667');
      expect(ret1).to.equal(null);
      const ret2 = getDeploymentKey('fdlkasjs-525.localhost');
      expect(ret2).to.equal(null);
      const ret3 = getDeploymentKey('fdlkasjs525-52.localhost');
      expect(ret3).to.equal(null);
      const ret4 = getDeploymentKey('fdlkasjs525-52.minard.io');
      expect(ret4).to.equal(null);
    });

  });

  describe('deployment events', () => {

    it('should post \'extracted\' event', async (done) => {
      // Arrange
      const bus = new EventBus();
      rimraf.sync(path.join(os.tmpdir(), 'minard'));
      const thePath = path.join(__dirname, '../../src/deployment/test-artifact.zip');
      const stream = fs.createReadStream(thePath);
      const opts = {
        status: 200,
        statusText: 'ok',
      };
      const response = new Response(stream, opts);
      const gitlabClient = getClient();
      const mockUrl = `${host}${gitlabClient.apiPrefix}/projects/1/builds/1/artifacts`;
      fetchMock.restore().mock(mockUrl, response);
      const deploymentsDir = path.join(os.tmpdir(), 'minard', 'deploys');

      const deploymentModule = new DeploymentModule( /* ts-lint-disable-line */
        gitlabClient,
        deploymentsDir,
        bus,
        logger
      );
      expect(deploymentModule.getDeploymentPath(1, 1)).to.exist;

      try {
        const eventPromise = bus
          .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
          .map(e => e.payload)
          .filter(e => e.status === 'extracted')
          .take(1)
          .toPromise();

        bus.post(createDeploymentEvent({ status: 'running', id: 1, projectId: 1 }));
        bus.post(createDeploymentEvent({ status: 'running', id: 2, projectId: 2 }));
        bus.post(createDeploymentEvent({ status: 'success', id: 1 }));

        const event = await eventPromise;
        expect(event.status).to.eq('extracted');
        expect(event.id).to.eq(1);
        done();
      } catch (err) {
        done(err);
      }
    });

  });

});
