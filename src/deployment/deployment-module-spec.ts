
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
import { LocalEventBus } from '../event-bus';
import { IFetchStatic } from '../shared/fetch.d.ts';
import { GitlabClient } from '../shared/gitlab-client';
import Logger from '../shared/logger';
import { promisify } from '../shared/promisify';

const fetchMock = require('fetch-mock');
const rimraf = require('rimraf');
const ncp = promisify(require('ncp'));
const mkpath = require('mkpath');

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
  const externalBaseUrl = 'http://foo-bar.com';

  const deployments: MinardDeployment[] = [
    {
      projectId: 5,
      id: 15,
      status: 'success',
      buildStatus: 'success',
      extractionStatus: 'success',
      screenshotStatus: 'success',
      finishedAt: moment(),
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
      projectId: 5,
      id: 16,
      status: 'success',
      buildStatus: 'success',
      extractionStatus: 'success',
      screenshotStatus: 'failed',
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
      projectId: 7,
      id: 17,
      status: 'running',
      buildStatus: 'running',
      extractionStatus: 'pending',
      screenshotStatus: 'pending',
      finishedAt: moment(),
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

  const screenshotModule = new ScreenshotModule({} as any, '', {} as any, '', externalBaseUrl);

  async function arrangeDeploymentModule(projectModule: ProjectModule = {} as any) {
    const knex = await setupKnex();
    await Promise.all(deployments.map(item => knex('deployment').insert(toDbDeployment(item))));
    const deploymentModule = new DeploymentModule(
      {} as any,
      {} as any,
      getEventBus(),
      {} as any,
      urlPattern,
      screenshotModule,
      projectModule,
      knex);
    return deploymentModule;
  }

  // function expectDeploymentBasicsEqual(target: MinardDeployment, expected: MinardDeployment) {
  //   expect(target.id).to.equal(expected.buildStatus);
  //   expect(target.commit).to.deep.equal(expected.commit);
  //   expect(target.commitHash).to.equal(expected.commitHash);
  //   expect(target.finishedAt!.)
  // }

  describe('getDeployment()', () => {
    it('should work for successfull deployment', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(15);

      // Assert
      expect(deployment!.finishedAt!.isSame(deployments[0]!.finishedAt!));
      const expected = Object.assign({}, deployments[0], {
        url: `http://deploy-master-foo-5-15.localhost:8000`,
        screenshot: screenshotModule.getPublicUrl(deployments[0].projectId, deployments[0].id),
        finishedAt: undefined,
      });
      const compare = Object.assign({}, deployment, { finishedAt: undefined });
      expect(compare).to.deep.equal(expected);
    });

    it('should work for deployment with failed screenshot', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(16);

      // Assert
      const expected = Object.assign({}, deployments[1], {
        url: `http://deploy-foo-branch-foo-5-16.localhost:8000`,
        finishedAt: undefined,
      });
      const compare = Object.assign({}, deployment, { finishedAt: undefined });
      expect(compare).to.deep.equal(expected);
    });

    it('should work for deployment with failed extraction', async () => {
      // Arrange
      const deploymentModule = await arrangeDeploymentModule();

      // Act
      const deployment = await deploymentModule.getDeployment(17);

      // Assert
      expect(deployment!.finishedAt!.isSame(deployments[2]!.finishedAt!));
      const expected = Object.assign({}, deployments[2], { finishedAt: undefined });
      const compare = Object.assign({}, deployment, { finishedAt: undefined });
      expect(compare).to.deep.equal(expected);
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
      const commit = {
        id: 'foo-sha',
        message: 'foo',
      };
      const projectModule = {} as ProjectModule;
      projectModule.getCommit = async (projectId: number, commitHash: string) => {
        expect(commitHash).to.equal(commit.id);
        expect(projectId).to.equal(6);
        return commit;
      };
      const deploymentModule = await arrangeDeploymentModule(projectModule);

      const buildCreatedEvent: BuildCreatedEvent = {
        project_id: 6,
        id: 5,
        project_name: 'foo-project-name',
        ref: 'master', // TODO
        sha: commit.id,
        status: 'pending',
      } as any;

      // Act
      await deploymentModule.createDeployment(buildCreatedEvent);

      // Assert
      const deployment = await deploymentModule.getDeployment(5);
      const compare = Object.assign({}, deployment);
      expect(compare).to.deep.equal({
        projectId: buildCreatedEvent.project_id,
        projectName: buildCreatedEvent.project_name,
        id: buildCreatedEvent.id,
        buildStatus: 'pending',
        extractionStatus: 'pending',
        screenshotStatus: 'pending',
        status: 'pending',
        commitHash: buildCreatedEvent.sha,
        commit: commit as any,
        ref: buildCreatedEvent.ref,
        finishedAt: undefined,
      } as MinardDeployment);
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
      try {
        await ret[0];
        expect.fail('should throw');
      } catch (err) {
        expect(err).to.equal('foo');
      }
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
          status: 'success',
        };
      };
      deploymentModule.downloadAndExtractDeployment = async (_projectId, _deploymentId) => {
        throw Error('some error');
      };
      try {
        await deploymentModule.doPrepareDeploymentForServing(2, 4);
        expect.fail('should throw exception');
      } catch (err) {
        //
      }
    });

  });

  describe('getDeploymentKey()', () => {

    it('should match localhost hostname with single-digit ids', () => {
      const ret = getDeploymentKeyFromHost('fdlkasjs-4-1.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(4);
      expect(ret.deploymentId).to.equal(1);
    });

    it('should match localhost hostname with multi-digit ids', () => {
      const ret = getDeploymentKeyFromHost('fdlkasjs-523-2667.localhost');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(523);
      expect(ret.deploymentId).to.equal(2667);
    });

    it('should match minard.io hostname with multi-digit ids', () => {
      const ret = getDeploymentKeyFromHost('fdlkasjs-145-3.minard.io');
      if (ret === null) { throw new Error(); }
      expect(ret.projectId).to.equal(145);
      expect(ret.deploymentId).to.equal(3);
    });

    it('should not match non-matching hostnames', () => {
      const ret1 = getDeploymentKeyFromHost('fdlkasjs-523-2667');
      expect(ret1).to.equal(null);
      const ret2 = getDeploymentKeyFromHost('fdlkasjs-525.localhost');
      expect(ret2).to.equal(null);
      const ret3 = getDeploymentKeyFromHost('fdlkasjs525-52.localhost');
      expect(ret3).to.equal(null);
      const ret4 = getDeploymentKeyFromHost('fdlkasjs525-52.minard.io');
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
        deploymentModule.createDeployment = async (event: BuildCreatedEvent) => {
          expect(event).to.deep.equal(payload);
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
      const bus = getEventBus();
      const deploymentModule = createDeploymentModule(bus);

      // Act & Assert
      const promise = new Promise((resolve, reject) => {
        deploymentModule.takeScreenshot = async (
          _projectId: number, _deploymentId: number) => {
          expect(deploymentId).to.equal(_deploymentId);
          expect(projectId).to.equal(_projectId);
          resolve();
        };
      });

      const payload: DeploymentEvent = {
        deployment: {
          id: deploymentId,
          projectId,
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

    async function initializeDb() {
      const knex = await setupKnex();
      await knex('deployment').insert(toDbDeployment({
        id: deploymentId,
        status: 'pending',
        buildStatus: 'pending',
        extractionStatus: 'pending',
        screenshotStatus: 'pending',
        commit: {
          id: 'foo',
        },
        finishedAt: moment(),
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
      knex: Knex,
      statusUpdate: DeploymentStatusUpdate,
      resultingUpdate: DeploymentStatusUpdate,
      resultingStatus: string) {

      // Arrange
      const bus = getEventBus();
      const deploymentModule = await arrangeDeploymentModule(bus, knex);
      deploymentModule.doPrepareDeploymentForServing = async(_projectId: number, _deploymentId: number) => undefined;
      deploymentModule.takeScreenshot = async(_projectId: number, _deploymentId: number) => undefined;

      const promise = bus.filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
        .map(event => event.payload).take(1).toPromise();

      // Act
      await deploymentModule.updateDeploymentStatus(deploymentId, statusUpdate);

      // Assert
      const event = await promise;
      expect(event.statusUpdate).to.deep.equal(resultingUpdate);
      const deployment = await deploymentModule.getDeployment(deploymentId);
      expect(deployment).to.exist;
      expect(deployment!.status).to.equal(resultingStatus);
    }

    it('should update with correct status when buildStatus turns to running', async () => {
      await shouldUpdateCorrectly(
          await initializeDb(),
          { buildStatus: 'running' },
          { buildStatus: 'running', status: 'running' },
          'running');
    });

    it('should update with correct status when buildStatus turns to failed', async () => {
      await shouldUpdateCorrectly(
          await initializeDb(),
          { buildStatus: 'failed' },
          { buildStatus: 'failed', status: 'failed' },
          'failed');
    });

    it('should update with correct status when buildStatus turns to success', async () => {
      const knex = await initializeDb();
      await shouldUpdateCorrectly(
        knex,
        { buildStatus: 'running' },
        { buildStatus: 'running', status: 'running' },
        'running');
      await shouldUpdateCorrectly(
        knex,
        { buildStatus: 'success' },
        { buildStatus: 'success' },
        'running');
    });

    it('should update with correct status when extractionStatus turns to success', async () => {
      const knex = await initializeDb();
      await shouldUpdateCorrectly(
        knex,
        { buildStatus: 'running' },
        { buildStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'running' },
        { extractionStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'success' },
        { extractionStatus: 'success' },
        'running');
    });

    it('should update with correct status when extractionStatus turns to failed', async () => {
      const knex = await initializeDb();
      await shouldUpdateCorrectly(
        knex,
        { buildStatus: 'running' },
        { buildStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'running' },
        { extractionStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'failed' },
        { extractionStatus: 'failed', status: 'failed' },
        'failed');
    });

    it('should update with correct status when screenshot turns to success', async () => {
      const knex = await initializeDb();

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'running' },
        { extractionStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'success' },
        { extractionStatus: 'success' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { screenshotStatus: 'success' },
        { screenshotStatus: 'success', status: 'success' },
        'success');
    });

    it('should update with correct status when screenshot turns to failed', async () => {
      const knex = await initializeDb();

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'running' },
        { extractionStatus: 'running', status: 'running' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { extractionStatus: 'success' },
        { extractionStatus: 'success' },
        'running');

      await shouldUpdateCorrectly(
        knex,
        { screenshotStatus: 'failed' },
        { screenshotStatus: 'failed', status: 'success' },
        'success');
    });

    it('should not update if there is nothing to update', async () => {
      await shouldUpdateCorrectly(await initializeDb(), { }, { }, 'pending');
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
