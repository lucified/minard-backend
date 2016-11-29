
import 'reflect-metadata';

import * as Boom from 'boom';
import { expect } from 'chai';
import * as fs from 'fs';
import * as Knex from 'knex';
import * as moment from 'moment';
import * as os from 'os';
import * as path from 'path';

import {
  ProjectModule,
} from '../project';

import DeploymentModule, {
  getDeploymentKeyFromHost,
  toDbDeployment,
} from './deployment-module';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  toGitlabTimestamp,
} from '../shared/time-conversion';

import {
  BuildCreatedEvent,
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentStatusUpdate,
  MinardDeployment,
  MinardJsonInfo,
  createBuildCreatedEvent,
  createBuildStatusEvent,
  createDeploymentEvent,
} from './types';

import { applyDefaults } from './gitlab-yml';

import Authentication from '../authentication/authentication-module';

import {
  Event,
  LocalEventBus,
} from '../event-bus';

import { fetch, fetchMock } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import { promisify } from '../shared/promisify';

const rimraf = require('rimraf');
const ncp = promisify(require('ncp'));
const mkpath = require('mkpath');

const host = 'gitlab';
const token = 'the-sercret';

const getClient = () => {
  class MockAuthModule {
    public async getRootAuthenticationToken() {
      return token;
    }
  }
  return new GitlabClient(host, fetchMock.fetchMock,
    new MockAuthModule() as Authentication, {} as any);
};

const silentLogger = Logger(undefined, true);
const basicLogger = Logger(undefined, false);

const eventBus = new LocalEventBus();

const deploymentUrlPattern = 'http://%s.localhost:8000';

const getDeploymentModule = (client: GitlabClient, path: string, _logger: any = basicLogger) => new DeploymentModule(
  client,
  path,
  eventBus,
  _logger,
  deploymentUrlPattern,
  {} as any,
  {} as any,
  {} as any,
);

function getEventBus() {
  return new LocalEventBus();
}

describe('deployment-module', () => {

  async function setupKnex() {
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await knex.migrate.latest({
      directory: 'migrations/deployment',
    });
    return knex;
  }

  const urlPattern = 'http://deploy-%s.localhost:8000';

  const deployments: MinardDeployment[] = [
    {
      teamId: 7,
      projectId: 5,
      id: 15,
      status: 'success',
      buildStatus: 'success',
      extractionStatus: 'success',
      screenshotStatus: 'success',
      finishedAt: moment(),
      createdAt: moment(),
      ref: 'master',
      projectName: 'foo-project',
      commit: {
        id: 'foo-commit-id',
        shortId: 'foo',
        message: 'foo-commit-message',
        author: {
          name: 'fooman',
          email: 'fooman@foomail.com',
          timestamp: 'fake-author-timestamp',
        },
        committer: {
          name: 'barman',
          email: 'barman@barmail.com',
          timestamp: 'fake-committer-timestamp',
        },
      },
      commitHash: 'foo-commit-id',
    },
    {
      teamId: 7,
      projectId: 5,
      id: 16,
      status: 'success',
      buildStatus: 'success',
      extractionStatus: 'success',
      screenshotStatus: 'failed',
      createdAt: moment(),
      finishedAt: moment().add(1, 'day'),
      ref: 'foo-branch',
      projectName: 'bar-project',
      commit: {
        id: 'bar-commit-id',
        shortId: 'foo',
        message: 'bar-commit-message',
        author: {
          name: 'foo-bar-man',
          email: 'foo-bar-man@foomail.com',
          timestamp: 'fake-author-timestamp',
        },
        committer: {
          name: 'bar-foo-man',
          email: 'bar-foo-man@barmail.com',
          timestamp: 'fake-committer-timestamp',
        },
      },
      commitHash: 'bar-commit-id',
    },
    {
      teamId: 8,
      projectId: 7,
      id: 17,
      status: 'running',
      buildStatus: 'running',
      extractionStatus: 'pending',
      screenshotStatus: 'pending',
      finishedAt: moment(),
      createdAt: moment(),
      ref: 'foo-bar-branch',
      projectName: 'foo-bar-project',
      commit: {
        id: 'foo-bar-commit-id',
        shortId: 'foo',
        message: 'foo-bar-commit-message',
        author: {
          name: 'foo-foo-bar-man',
          email: 'foo-foo-bar-man@foomail.com',
          timestamp: 'fake-author-timestamp',
        },
        committer: {
          name: 'foo-bar-foo-man',
          email: 'foo-bar-foo-man@barmail.com',
          timestamp: 'foo-fake-committer-timestamp',
        },
      },
      commitHash: 'foo-bar-commit-id',
    },
  ];

  const screenshotModule = {} as ScreenshotModule;
  screenshotModule.getPublicUrl = (projectId: number, deploymentId: number) =>
    `http://foobar.com/screenshot${projectId}/${deploymentId}` ;

  async function arrangeDeploymentModule(projectModule: ProjectModule = {} as any, bus: LocalEventBus = getEventBus()) {
    const knex = await setupKnex();
    await Promise.all(deployments.map(item => knex('deployment').insert(toDbDeployment(item))));
    const deploymentModule = new DeploymentModule(
      {} as any,
      {} as any,
      bus,
      {} as any,
      urlPattern,
      screenshotModule,
      projectModule,
      knex);
    return deploymentModule;
  }

  describe('getDeployment()', () => {
    it('should work for successfull deployment', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(15);

      // Assert
      const dep = deployment!;

      expect(dep.finishedAt!.isSame(deployments[0]!.finishedAt!));
      expect(dep.createdAt.isSame(deployments[0]!.createdAt));
      expect(dep.screenshot).to.equal(screenshotModule.getPublicUrl(deployments[0].projectId, deployments[0].id));
      expect(dep.url).to.equal(`http://deploy-master-foo-5-15.localhost:8000`);
      expect(dep.creator!.name).to.equal(deployments[0].commit.committer.name);
      expect(dep.creator!.email).to.equal(deployments[0].commit.committer.email);
      expect(dep.creator!.timestamp).to.equal(toGitlabTimestamp(deployments[0].createdAt));
    });

    it('should work for deployment with failed screenshot', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(16);

      // Assert
      expect(deployment!.screenshot).to.equal(undefined);
      expect(deployment!.url).to.equal(`http://deploy-foo-branch-foo-5-16.localhost:8000`);
    });

    it('should work for deployment with failed extraction', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(17);

      // Assert
      expect(deployment!.screenshot).to.equal(undefined);
      expect(deployment!.url).to.equal(undefined);
      expect(deployment!.finishedAt!.isSame(deployments[2]!.finishedAt!));
    });

    it('should return null if deployment is not found', async () => {
      const deploymentModule = await arrangeDeploymentModule();    // Arrange
      const deployment = await deploymentModule.getDeployment(18); // Act
      expect(deployment).to.equal(undefined);                      // Assert
    });
  });

  describe('getProjectDeployments()', () => {
    it('it should work with response returning two deployments', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getProjectDeployments(deployments[0].projectId);

      // Assert
      expect(ret.length).equals(2);
      expect(ret[0].id).to.equal(deployments[1].id);
      expect(ret[1].id).to.equal(deployments[0].id);
      expect(ret[0].url).to.exist;
      expect(ret[1].url).to.exist;
    });
  });

  describe('getDeploymentsByStatus()', () => {
    it('it should work with for success deployments', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getDeploymentsByStatus('success');

      // Assert
      expect(ret.length).equals(2);
      expect(ret[0].id).to.equal(deployments[1].id);
      expect(ret[1].id).to.equal(deployments[0].id);
      expect(ret[0].url).to.exist;
      expect(ret[1].url).to.exist;
    });

    it('it should work for running deployment', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getDeploymentsByStatus('running');

      // Assert
      expect(ret.length).equals(1);
      expect(ret[0].id).to.equal(deployments[2].id);
    });
  });

  describe('getLatestSuccessfulProjectDeployment()', () => {
    it('it should return correct deployment when it can be found', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getLatestSuccessfulProjectDeployment(5);

      // Assert
      expect(ret).to.exist;
      expect(ret!.id).to.equal(deployments[1].id);
      expect(ret!.url).to.exist;
    });

    it('it should return null when deployment cannot be found', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getLatestSuccessfulProjectDeployment(500);

      // Assert
      expect(ret).to.equal(undefined);
    });
  });

  describe('getLatestSuccessfulBranchDeployment()', () => {
    it('should return correct deployment when one can be found', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getLatestSuccessfulBranchDeployment(5, 'foo-branch');

      // Assert
      expect(ret).to.exist;
      expect(ret!.id).to.equal(deployments[1].id);
      expect(ret!.url).to.exist;
    });

    it('should return null when deployment cannot be found', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getLatestSuccessfulBranchDeployment(5, 'nonexistent-branch');

      // Assert
      expect(ret).to.equal(undefined);
    });
  });

  describe('getCommitDeployments()', () => {
    it('it should work with response returning a single deployments', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const ret = await deploymentModule.getCommitDeployments(
        deployments[0].projectId, deployments[0].commitHash);

      // Assert
      expect(ret.length).equals(1);
      expect(ret[0].id).to.deep.equal(deployments[0].id);
      expect(ret[0].url).to.exist;
    });
  });

  describe('createDeployment', () => {
    it('should fetch related commit and add deployment', async () => {
      // Arrange
      const teamId = 9;
      const commit = {
        id: 'foo-sha',
        message: 'foo',
        committer: {
          name: 'foo',
          email: 'fooman@foomail.com',
        },
      };
      const projectModule = {} as ProjectModule;
      projectModule.getCommit = async (projectId: number, commitHash: string) => {
        expect(commitHash).to.equal(commit.id);
        expect(projectId).to.equal(6);
        return commit;
      };
      projectModule.getProject = async (projectId: number) => {
        expect(projectId).to.equal(6);
        return {
          teamId,
        };
      };
      const bus = getEventBus();
      const deploymentModule = await arrangeDeploymentModule(projectModule, bus);

      const buildCreatedEvent: Event<BuildCreatedEvent> = createBuildCreatedEvent({
        project_id: 6,
        id: 5,
        project_name: 'foo-project-name',
        ref: 'master', // TODO
        sha: commit.id,
        status: 'running',
      } as any);

      const promise = bus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE).take(1).toPromise();

      // Act
      await deploymentModule.createDeployment(buildCreatedEvent);

      // Assert
      const deployment = await deploymentModule.getDeployment(5);
      let compare = Object.assign({}, deployment, { createdAt: undefined });
      const expected = {
        teamId,
        projectId: buildCreatedEvent.payload.project_id,
        projectName: buildCreatedEvent.payload.project_name,
        id: buildCreatedEvent.payload.id,
        buildStatus: 'running',
        extractionStatus: 'pending',
        screenshotStatus: 'pending',
        status: 'running',
        commitHash: buildCreatedEvent.payload.sha,
        commit: commit as any,
        ref: buildCreatedEvent.payload.ref,
        finishedAt: undefined,
        createdAt: undefined,
        creator: {
          name: commit.committer.name,
          email: commit.committer.email,
          timestamp: toGitlabTimestamp(buildCreatedEvent.created),
        },
      };
      expect(compare).to.deep.equal(expected);
      const event = await promise;
      expect(event.payload.statusUpdate).to.deep.equal({
        status: 'running',
        buildStatus: 'running',
      });
    });
  });

  describe('downloadAndExtractDeployment()', () => {
    // Example URL for manual testing
    // http://localhost:10080/api/v3/projects/1/builds/3/artifacts\?private_token=BSKaHunLUSyxp_X-MK1a

    it('should work with a simple artifact', async () => {
      // Arrange
      rimraf.sync(path.join(os.tmpdir(), 'minard'));
      const thePath = path.join(__dirname, '../../src/deployment/test-data/test-artifact.zip');
      const stream = fs.createReadStream(thePath);
      const opts = {
        status: 200,
        statusText: 'ok',
      };
      const response = new fetch.Response(stream, opts);
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
      expect(deploymentPath).to.equal(deploymentModule.getTempArtifactsPath(1, 2));
    });

  });

  describe('moveExtractedDeployment()', () => {

    const projectId = 3;
    const deploymentId = 4;
    const branchName = 'master';
    const deploymentPath = path.join(os.tmpdir(), 'minard-move', 'test-deployment');
    const extractedPath = path.join(os.tmpdir(), 'minard-move', 'extracted');

    async function shouldMoveCorrectly(publicRoot: string, artifactFolder: string, _logger: any = basicLogger) {
      // Arrange
      rimraf.sync(deploymentPath);
      rimraf.sync(extractedPath);
      mkpath.sync(extractedPath);
      await ncp(path.join(__dirname, '../../src/deployment/test-data'), extractedPath);
      const deploymentModule = {
        logger: _logger,
        getTempArtifactsPath: (_projectId: number, _deploymentId: number) => {
          expect(_projectId).to.equal(projectId);
          expect(_deploymentId).to.equal(deploymentId);
          return path.join(extractedPath, artifactFolder);
        },
        getDeployment: async (_deploymentId: number) => {
          expect(_deploymentId).to.equal(deploymentId);
          return {
            ref: branchName,
          } as MinardDeployment;
        },
        getMinardJsonInfo: async (_projectId: number, sha: string) => {
          expect(_projectId).to.equal(projectId);
          expect(sha).to.equal(branchName);
          return {
            effective: {
              publicRoot,
            },
          };
        },
        getDeploymentPath: (_projectId: number, _deploymentId: number) => {
          expect(_projectId).to.equal(projectId);
          expect(_deploymentId).to.equal(deploymentId);
          return deploymentPath;
        },
      } as {} as DeploymentModule;
      deploymentModule.moveExtractedDeployment = DeploymentModule
        .prototype.moveExtractedDeployment.bind(deploymentModule);

      // Act
      await deploymentModule.moveExtractedDeployment(projectId, deploymentId);

      // Assert
      expect(fs.existsSync(path.join(deploymentPath, 'index.html'))).to.equal(true);
    }

    it('should move files correctly when publicRoot is "foo"', async () => {
      await shouldMoveCorrectly('foo', 'test-extracted-artifact-1');
    });

    it('should move files correctly when publicRoot is "foo/bar"', async () => {
      await shouldMoveCorrectly('foo/bar', 'test-extracted-artifact-2');
    });

    it('should move files correctly when publicRoot is "."', async () => {
      await shouldMoveCorrectly('.', 'test-extracted-artifact-3');
    });

    it('should throw error when publicRoot does not exist in artifacts"', async () => {
      try {
        await shouldMoveCorrectly('bar', 'test-extracted-artifact-2', silentLogger);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).data).to.equal('no-dir-at-public-root');
      }
    });

  });

  it('getDeploymentPath()', () => {
    const deploymentModule = getDeploymentModule({} as GitlabClient, 'example');
    const deploymentPath = deploymentModule.getDeploymentPath(1, 4);
    expect(deploymentPath).to.equal('example/1/4');
  });

  describe('prepareDeploymentForServing', () => {

    function sleep(ms = 0) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function shouldQueueCalls(
      resolveOrReject: (resolve: (arg: any) => void, reject: (arg: any) => void) => void) {

      const deploymentModule = getDeploymentModule({} as any, '');
      let resolve1: ((arg: any) => void) | undefined = undefined;
      let reject1: ((arg: any) => void) | undefined = undefined;
      let resolve2: ((arg: any) => void) | undefined = undefined;
      const promise1 = new Promise((resolve, reject) => {
        resolve1 = resolve;
        reject1 = reject;
      });
      const promise2 = new Promise((resolve, reject) => {
        resolve2 = resolve;
      });
      let firstCalled = false;
      let secondCalled = false;
      deploymentModule.doPrepareDeploymentForServing = (projectId, deploymentId) => {
        if (projectId === 1 && deploymentId === 11) {
          firstCalled = true;
          return promise1;
        }
        if (projectId === 2 && deploymentId === 22) {
          secondCalled = true;
          return promise2;
        }
        throw Error('invalid projectId or deploymentId');
      };
      const retPromise1 = deploymentModule.prepareDeploymentForServing(1, 11);
      const retPromise2 = deploymentModule.prepareDeploymentForServing(2, 22);

      // add catch to prevent warnings for unhandled promise which will
      // actually be handled later.
      // http://clarkdave.net/2016/09/node-v6-6-and-asynchronously-handled-promise-rejections/
      retPromise1.catch(err => null);

      expect(firstCalled).to.equal(true);
      expect(secondCalled).to.equal(false);
      // sleep a moment to make sure that the second call
      // is not made before we resolve the previous promise
      await sleep(10);
      expect(secondCalled).to.equal(false);
      resolveOrReject(resolve1!, reject1!);
      // now that the previous promise is resolved, the next
      // one may be called. sleep a moment to give control to
      // the queue, so it gets a change to call doPrepareDeploymentForServing
      await sleep(10);
      expect(secondCalled).to.equal(true);
      resolve2!('bar');
      return [retPromise1, retPromise2];
    }

    it('should queue calls to doPrepareDeploymentForServing', async () => {
      const ret = await shouldQueueCalls((resolve: (arg: any) => void, reject: (arg: any) => void) => {
        resolve('foo');
      });
      expect(await ret[0]).to.equal('foo');
      expect(await ret[1]).to.equal('bar');
    });

    it('should queue calls to doPrepareDeploymentForServing after rejected promises', async () => {
      const ret = await shouldQueueCalls((resolve: (arg: any) => void, reject: (arg: any) => void) => {
        reject('foo');
      });

      let error: any;
      await (ret[0].then(() => expect.fail('should throw')).catch((err) => error = err));

      expect(error).to.equal('foo');
      expect(await ret[1]).to.equal('bar');
    });

  });

  describe('getMinardJsonInfo()', () => {
    const projectId = 5;
    const branchName = 'foo';

    function arrangeDeploymentModule(rawMinardJson?: string) {
      const deploymentModule = getDeploymentModule({} as any, '');
      deploymentModule.getRawMinardJson = async (_projectId: number, shaOrBranchName: string) => {
        expect(_projectId).to.equal(projectId);
        expect(shaOrBranchName).to.equal(branchName);
        return rawMinardJson;
      };
      return deploymentModule;
    }

    function expectDefaultInfo(info: MinardJsonInfo) {
      expect(info.errors).to.exist;
      expect(info.errors).to.have.length(0);
      expect(info.effective).to.deep.equal(applyDefaults({}));
    }

    it('should return correct info when there is no minard.json', async () => {
      // Arrange
      const deploymentModule = arrangeDeploymentModule(undefined);

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expectDefaultInfo(info);
      expect(info.content).to.equal(undefined);
      expect(info.parsed).to.equal(undefined);
    });

    it('should return correct info when minard.json does not parse', async () => {
      // Arrange
      const content = '{[';
      const deploymentModule = arrangeDeploymentModule(content);

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expect(info.content).to.equal(content);
      expect(info.parsed).to.equal(undefined);
      expect(info.errors).to.exist;
      expect(info.errors).to.have.length(1);
      expect(info.effective).to.equal(undefined);
    });

    it('should return correct info when minard.json is empty', async () => {
      // Arrange
      const content = '';
      const deploymentModule = arrangeDeploymentModule(content);

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expectDefaultInfo(info);
      expect(info.parsed).to.equal(undefined);
      expect(info.content).to.equal(content);
    });

    it('should return correct info when minard.json is empty object', async () => {
      // Arrange
      const content = '{}';
      const deploymentModule = arrangeDeploymentModule(content);

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expectDefaultInfo(info);
      expect(info.parsed).to.deep.equal({});
      expect(info.content).to.equal(content);
    });

    it('should return correct info when minard.json has publicRoot and repo has its path', async () => {
      // Arrange
      const minardJson = { publicRoot: 'foo' };
      const content = JSON.stringify(minardJson);
      const deploymentModule = arrangeDeploymentModule(content);

      deploymentModule.filesAtPath = async (_projectId: number, shaOrBranchName: string, path: string) => {
        expect(_projectId).to.equal(projectId);
        expect(shaOrBranchName).to.equal(branchName);
        expect(path).to.equal(minardJson.publicRoot);
        return [{}];
      };

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expect(info).to.exist;
      expect(info.content).to.equal(content);
      expect(info.effective).to.exist;
      expect(info.effective!.publicRoot).to.equal(minardJson.publicRoot);
      expect(info.parsed!).to.deep.equal(minardJson);
      expect(info.errors).to.have.length(0);
    });

    it('should return correctly when minard.json has publicRoot, no build, but repo is missing the path', async () => {
      // Arrange
      const minardJson = { publicRoot: 'foo' };
      const content = JSON.stringify(minardJson);
      const deploymentModule = arrangeDeploymentModule(content);

      deploymentModule.filesAtPath = async (_projectId: number, shaOrBranchName: string, path: string) => {
        expect(_projectId).to.equal(projectId);
        expect(shaOrBranchName).to.equal(branchName);
        expect(path).to.equal(minardJson.publicRoot);
        return [];
      };

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expect(info).to.exist;
      expect(info.content).to.equal(content);
      expect(info.effective).to.exist;
      expect(info.effective!.publicRoot).to.equal(minardJson.publicRoot);
      expect(info.errors).to.have.length(1);
    });

    it('should return correctly when minard.json has publicRoot, a build and repo is missing the path', async () => {
      // Arrange
      const minardJson = { publicRoot: 'foo', build: { commands: ['foo-command'] }};
      const content = JSON.stringify(minardJson);
      const deploymentModule = arrangeDeploymentModule(content);

      // Act
      const info = await deploymentModule.getMinardJsonInfo(projectId, branchName);

      // Assert
      expect(info).to.exist;
      expect(info.content).to.equal(content);
      expect(info.effective).to.exist;
      expect(info.effective!.publicRoot).to.equal(minardJson.publicRoot);
      expect(info.effective!.build!.commands).to.deep.equal(minardJson.build.commands);
      expect(info.errors).to.have.length(0);
    });

  });

  describe('doPrepareDeploymentForServing()', () => {

    it('should throw error when deployment not found', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (deploymentId) => {
        expect(deploymentId).to.equal(4);
        return null;
      };
      try {
        await deploymentModule.doPrepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        expect(err.message).to.equal('No deployment found for: projectId 2, deploymentId 4');
      }
    });

    it('should throw error when build status is not success', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '', silentLogger);
      deploymentModule.getDeployment = async (_deploymentId) => {
        return {
          buildStatus: 'failed',
        };
      };
      try {
        await deploymentModule.doPrepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        expect(err.message).to.equal('Deployment status is "failed" for: projectId 2, deploymentId 4');
      }
    });

    it('should call downloadAndExtractDeployment when deployment is successful', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '');
      deploymentModule.getDeployment = async (_deploymentId) => {
        return {
          buildStatus: 'success',
        };
      };
      let called = false;
      deploymentModule.updateDeploymentStatus = async () => undefined;
      deploymentModule.downloadAndExtractDeployment = async (projectId, deploymentId) => {
        expect(projectId).to.equal(2);
        expect(deploymentId).to.equal(4);
        called = true;
      };
      let moveCalled = false;
      deploymentModule.moveExtractedDeployment = async (projectId, deploymentId) => {
        expect(projectId).to.equal(2);
        expect(deploymentId).to.equal(4);
        moveCalled = true;
      };
      await deploymentModule.doPrepareDeploymentForServing(2, 4);
      expect(called).to.equal(true);
      expect(moveCalled).to.equal(true);
    });

    it('should report internal error', async () => {
      const deploymentModule = getDeploymentModule({} as GitlabClient, '', silentLogger);
      deploymentModule.getDeployment = async (_deploymentId) => {
        return {
          buildStatus: 'success',
        };
      };
      deploymentModule.updateDeploymentStatus = async () => undefined;
      deploymentModule.downloadAndExtractDeployment = async (_projectId, _deploymentId) => {
        throw Error('some error');
      };
      let error: any;
      await (deploymentModule.doPrepareDeploymentForServing(2, 4)
        .then(() => expect.fail('should throw exception')))
        .catch((err) => error = err);
      expect(error.isBoom).to.be.true;
      expect(error.isServer).to.be.true;
    });

  });

  describe('getGitLabYml()', () => {

    const projectId = 9;
    const sha = 'foo-sha';

    function arrangeDeploymentModule(_deployments: MinardDeployment[]) {
      const deploymentModule = getDeploymentModule({} as any, 'foo', silentLogger);
      deploymentModule.getMinardJsonInfo = async (projectId: number, shaOrBranchName: string) => {
        const info: MinardJsonInfo = {
          content: '{}',
          effective: {},
          errors: [],
          parsed: {},
        };
        return info;
      };
      deploymentModule.getCommitDeployments = async (_projectId: number, _sha: string) => {
        expect(_projectId).to.equal(projectId);
        expect(_sha).to.equal(sha);
        return _deployments;
      };
      return deploymentModule;
    }

    it('should return gitlab yml with manual build when there is already a build with status success for given sha',
      async () => {
      // Arrange
      const deploymentModule = arrangeDeploymentModule([{ buildStatus: 'success' } as MinardDeployment]);

      // Act
      const yml = await deploymentModule.getGitlabYml(projectId, 'foo', sha);

      // Assert
      expect(yml.indexOf('manual') !== -1).to.equal(true);
    });

    it('should return gitlab yml with manual build when there is already a build with status success for given sha',
      async () => {
      // Arrange
      const deploymentModule = arrangeDeploymentModule([{ buildStatus: 'failed' } as MinardDeployment]);

      // Act
      const yml = await deploymentModule.getGitlabYml(projectId, 'foo', sha);

      // Assert
      expect(yml.indexOf('manual') !== -1).to.equal(true);
    });

    it('should return normal gitlab yml when there are no builds for given sha sha', async () => {
      // Arrange
      const deploymentModule = arrangeDeploymentModule([]);

      // Act
      const yml = await deploymentModule.getGitlabYml(projectId, 'foo', sha);

      // Assert
      expect(yml.indexOf('manual')).to.equal(-1);
    });

    it('should return normal gitlab yml when there is only a running build for given sha ', async () => {
      // Arrange
      const deploymentModule = arrangeDeploymentModule([]);

      // Act
      const yml = await deploymentModule.getGitlabYml(projectId, 'foo', sha);

      // Assert
      expect(yml.indexOf('manual')).to.equal(-1);
    });
  });


  describe('getDeploymentKey()', () => {

    it('should match localhost hostname with single-digit ids', () => {
      const ret = getDeploymentKeyFromHost('foo-fdl65kasjs-4-1.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.shortId).to.equal('fdl65kasjs');
      expect(ret.projectId).to.equal(4);
      expect(ret.deploymentId).to.equal(1);
    });

    it('should match localhost hostname with multi-digit ids', () => {
      const ret = getDeploymentKeyFromHost('foo-fdl65kasjs-523-2667.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.shortId).to.equal('fdl65kasjs');
      expect(ret.projectId).to.equal(523);
      expect(ret.deploymentId).to.equal(2667);
    });

    it('should match minard.io hostname with multi-digit ids', () => {
      const ret = getDeploymentKeyFromHost('foo-fdl65kasjs-145-3.minard.io');
      if (ret === null) { throw new Error(); }
      expect(ret.shortId).to.equal('fdl65kasjs');
      expect(ret.projectId).to.equal(145);
      expect(ret.deploymentId).to.equal(3);
    });

    it('should not match non-matching hostnames', () => {
      const ret1 = getDeploymentKeyFromHost('foo-fdl65kasjs-523-2667');
      expect(ret1).to.equal(null);
      const ret2 = getDeploymentKeyFromHost('foo-fdl65kasjs-525.localhost');
      expect(ret2).to.equal(null);
      const ret3 = getDeploymentKeyFromHost('foo-fdl65kasjs525-52.localhost');
      expect(ret3).to.equal(null);
      const ret4 = getDeploymentKeyFromHost('foo-fdl65kasjs525-52.minard.io');
      expect(ret4).to.equal(null);
    });

  });

  describe('subscribeToEvents', () => {
    function createDeploymentModule(bus: LocalEventBus, _logger: any = silentLogger) {
      return new DeploymentModule({} as any, '', bus, _logger, '', {} as any, {} as any, {} as any);
    }

    it('should create deployment on BuildCreatedEvent', async () => {
      // Arrange
      const payload = { foo: 'bar' };
      const bus = getEventBus();
      const deploymentModule = createDeploymentModule(bus, basicLogger);

      const promise = new Promise((resolve, reject) => {
        deploymentModule.createDeployment = async (event: Event<BuildCreatedEvent>) => {
          expect(event.payload).to.deep.equal(payload);
          resolve();
        };
      });

      bus.post(createBuildCreatedEvent(payload as any));
      await promise;
    });

    it('should update deployment status on BuildStatusEvent', async () => {
      // Arrange
      const status = 'running' as 'running'; // make typescript happy
      const deploymentId = 5;
      const bus = getEventBus();
      const deploymentModule = createDeploymentModule(bus, basicLogger);

      // Act & Assert
      const promise = new Promise((resolve, reject) => {
        deploymentModule.updateDeploymentStatus = async (_deploymentId: number, updates: DeploymentStatusUpdate) => {
          expect(_deploymentId).to.equal(deploymentId);
          expect(updates.buildStatus).to.equal(status);
          resolve();
        };
      });
      bus.post(createBuildStatusEvent({
        deploymentId,
        status,
      }));
      await promise;
    });

    it('should prepare finished builds for serving after successful build', async () => {
      // Arrange
      const deploymentId = 5;
      const projectId = 7;
      const bus = getEventBus();
      const deploymentModule = createDeploymentModule(bus, basicLogger);

      // Act & Assert
      const promise = new Promise((resolve, reject) => {
        deploymentModule.prepareDeploymentForServing = async (
          _projectId: number, _deploymentId: number, checkStatus: boolean) => {
          expect(deploymentId).to.equal(_deploymentId);
          expect(projectId).to.equal(_projectId);
          expect(checkStatus).to.equal(false);
          resolve();
        };
      });

      const payload: DeploymentEvent = {
        deployment: {
          id: deploymentId,
          projectId,
        },
        statusUpdate: {
          buildStatus: 'success',
        },
      } as any;
      bus.post(createDeploymentEvent(payload));
      await promise;
    });

    it('should take screenshots after successful extractions', async () => {
      // Arrange
      const deploymentId = 5;
      const projectId = 7;
      const shortId = 'foo';
      const bus = getEventBus();
      const deploymentModule = createDeploymentModule(bus);

      // Act & Assert
      const promise = new Promise((resolve, reject) => {
        deploymentModule.takeScreenshot = async (
          _projectId: number, _deploymentId: number, _shortId: string) => {
          expect(deploymentId).to.equal(_deploymentId);
          expect(projectId).to.equal(_projectId);
          expect(shortId).to.equal(_shortId);
          resolve();
        };
      });

      const payload: DeploymentEvent = {
        deployment: {
          id: deploymentId,
          projectId,
          commit: {
            shortId,
          },
        },
        statusUpdate: {
          extractionStatus: 'success',
        },
      } as any;
      bus.post(createDeploymentEvent(payload));
      await promise;
    });
  });

  describe('updateDeploymentStatus', () => {

    const deploymentId = 20;
    const otherDeploymentId = 21;
    const teamId = 9;

    async function initializeDb(beforeState: any) {
      const knex = await setupKnex();
      await knex('deployment').insert(toDbDeployment(Object.assign({
        id: deploymentId,
        status: 'pending',
        buildStatus: 'pending',
        extractionStatus: 'pending',
        screenshotStatus: 'pending',
        createdAt: moment(),
        commit: {
          id: 'foo',
          committer: {
            email: 'fooman@foomail.com',
            name: 'foo',
          },
        },
        finishedAt: undefined,
        teamId,
      }, beforeState)));
      await knex('deployment').insert(toDbDeployment({
        id: otherDeploymentId,
        status: 'pending',
        buildStatus: 'pending',
        extractionStatus: 'pending',
        screenshotStatus: 'pending',
        createdAt: moment(),
        commit: {
          id: 'foo',
          committer: {
            email: 'fooman@foomail.com',
            name: 'foo',
          },
        } as any,
        finishedAt: undefined,
        teamId,
      } as any));

      return knex;
    }

    async function arrangeDeploymentModule(bus: LocalEventBus, knex: Knex) {
      const deploymentModule = new DeploymentModule(
        {} as any,
        {} as any,
        bus,
        {} as any,
        urlPattern,
        screenshotModule,
        {} as any,
        knex);
      return deploymentModule;
    }

    async function shouldUpdateCorrectly(
      beforeState: any,
      statusUpdate: DeploymentStatusUpdate,
      resultingUpdate: DeploymentStatusUpdate,
      resultingStatus: string) {

      // Arrange
      const bus = getEventBus();
      const deploymentModule = await arrangeDeploymentModule(bus, await initializeDb(beforeState));
      deploymentModule.doPrepareDeploymentForServing = async(_projectId: number, _deploymentId: number) => undefined;
      deploymentModule.takeScreenshot = async(_projectId: number, _deploymentId: number) => undefined;

      const promise = bus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
        .map(event => event.payload).take(1).toPromise();

      // Act
      await deploymentModule.updateDeploymentStatus(deploymentId, statusUpdate);

      // Assert
      const event = await promise;
      expect(event.statusUpdate).to.deep.equal(resultingUpdate);
      expect(event.teamId).to.equal(teamId);
      const deployment = await deploymentModule.getDeployment(deploymentId);
      expect(deployment).to.exist;
      expect(deployment!.status).to.equal(resultingStatus);

      // status for other deployment should not change
      const otherDeployment = await deploymentModule.getDeployment(otherDeploymentId);
      expect(otherDeployment).to.exist;
      expect(otherDeployment!.status).to.equal('pending');
      return deployment;
    }

    async function shouldNotUpdate(
      beforeState: any,
      statusUpdate: DeploymentStatusUpdate,
      resultingUpdate: DeploymentStatusUpdate,
      resultingStatus: string) {

      // Arrange
      const bus = getEventBus();
      const deploymentModule = await arrangeDeploymentModule(bus, await initializeDb(beforeState));
      deploymentModule.doPrepareDeploymentForServing = async(_projectId: number, _deploymentId: number) => undefined;
      deploymentModule.takeScreenshot = async(_projectId: number, _deploymentId: number) => undefined;

      let called = false;
      bus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
        .subscribe(item => {
          called = true;
        });

      // Act
      await deploymentModule.updateDeploymentStatus(deploymentId, statusUpdate);
      expect(called).to.be.false;
    }

    it('should update with correct status when buildStatus turns to running', async () => {
      await shouldUpdateCorrectly(
          { },
          { buildStatus: 'running' },
          { buildStatus: 'running', status: 'running' },
          'running');
    });

    it('should update with correct status when buildStatus turns to failed', async () => {
      await shouldUpdateCorrectly(
          { buildStatus: 'running', status: 'running'},
          { buildStatus: 'failed' },
          { buildStatus: 'failed', status: 'failed' },
          'failed');
    });

    it('should update with correct status when buildStatus turns to success', async () => {
      await shouldUpdateCorrectly(
        { buildStatus: 'running', status: 'running'},
        { buildStatus: 'success' },
        { buildStatus: 'success' },
        'running');
    });

    it('should update with correct status when extractionStatus turns to running', async () => {
      await shouldUpdateCorrectly(
        { buildStatus: 'success', status: 'running'},
        { extractionStatus: 'running' },
        { extractionStatus: 'running' },
        'running');
    });

    it('should update with correct status when extractionStatus turns to success', async () => {
      const deployment = await shouldUpdateCorrectly(
        { buildStatus: 'success', status: 'running', extractionStatus: 'running'},
        { extractionStatus: 'success' },
        { extractionStatus: 'success' },
        'running');
      expect(deployment!.url).to.exist;
    });

    it('should update with correct status when extractionStatus turns to failed', async () => {
      await shouldUpdateCorrectly(
        { buildStatus: 'success', status: 'running', extractionStatus: 'running'},
        { extractionStatus: 'failed' },
        { extractionStatus: 'failed', status: 'failed' },
        'failed');
    });

    it('should update with correct status when screenshot turns to running', async () => {
      const deployment = await shouldUpdateCorrectly(
        { buildStatus: 'success', extractionStatus: 'success', status: 'running' },
        { screenshotStatus: 'running' },
        { screenshotStatus: 'running' },
        'running');
      expect(deployment!.finishedAt).to.not.exist;
    });

    it('should update with correct status when screenshot turns to success', async () => {
      const deployment = await shouldUpdateCorrectly(
        { buildStatus: 'success', extractionStatus: 'success', status: 'running' },
        { screenshotStatus: 'success' },
        { screenshotStatus: 'success', status: 'success' },
        'success');
      expect(deployment!.screenshot).to.exist;
      expect(deployment!.finishedAt).to.exist;
    });

    it('should update with correct status when screenshot turns to failed', async () => {
      const deployment = await shouldUpdateCorrectly(
        { buildStatus: 'success', extractionStatus: 'success', status: 'running' },
        { screenshotStatus: 'failed' },
        { screenshotStatus: 'failed', status: 'success' },
        'success');
      expect(deployment!.finishedAt).to.exist;
    });

    it('should not update if there is nothing to update', async () => {
      await shouldNotUpdate(
        { },
        { },
        { },
        'pending');
    });

    it('should not update if buildStatus is already running', async () => {
      await shouldNotUpdate(
        { buildStatus: 'running', status: 'running' },
        { buildStatus: 'running' },
        { },
        'running');
    });

    it('should update with correct status when screenshot turns to success when deployment is already success',
      async () => {
      // this can happen when we recreate screenshots for deployments
      // that were successfully created but screenshots failed for some reason
      await shouldUpdateCorrectly(
        { buildStatus: 'success', extractionStatus: 'success', status: 'success', screenshotStatus: 'failed' },
        { screenshotStatus: 'success' },
        { screenshotStatus: 'success' }, // note that overall deployment status does not update
        'success');
    });

  });

  describe('filesAtPath', () => {

    const projectId = 2;
    const branch = 'foo-branch';
    const repoPath = 'foo';

    const gitlabResponse = [
      {
        'id': 'cdbaeae40f0655455c8159ee34fc6749c8f8968e',
        'name': 'src',
        'type': 'tree',
        'mode': '040000',
      },
      {
        'id': '4b6793ae68a6587d28c23b11c1a09b5a6b923215',
        'name': 'README.md',
        'type': 'blob',
        'mode': '100644',
      },
    ];

    it ('should return correct response when two files are found', async () => {
      // Arrange
      const gitlabClient = getClient();
      const response = {
        status: 200,
        body: gitlabResponse,
      };
      fetchMock.restore().mock(`${host}${gitlabClient.apiPrefix}` +
        `/projects/${projectId}/repository/tree?path=${repoPath}`, response);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      const files = await deploymentModule.filesAtPath(2, branch, repoPath);
      // Assert
      expect(files).to.exist;
      expect(files).to.have.length(2);
      expect(files[0].name).to.equal(gitlabResponse[0].name);
      expect(files[0].type).to.equal(gitlabResponse[0].type);
    });

    it ('should throw when project is not found', async () => {
      // Arrange
      const gitlabClient = getClient();
      const response = {
        status: 404,
        body: gitlabResponse,
      };
      fetchMock.restore().mock(`${host}${gitlabClient.apiPrefix}` +
        `/projects/${projectId}/repository/tree?path=${repoPath}`, response);
      const deploymentModule = getDeploymentModule(gitlabClient, '');
      // Act
      try {
        await deploymentModule.filesAtPath(2, branch, repoPath);
        expect.fail('should throw');
      } catch (err) {
        expect((<Boom.BoomError> err).isBoom).to.equal(true);
        expect((<Boom.BoomError> err).output.statusCode).to.equal(404);
      }
    });

  });

});
