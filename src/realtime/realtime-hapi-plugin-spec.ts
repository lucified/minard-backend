import { Observable } from '@reactivex/rxjs';
import { expect } from 'chai';
import * as moment from 'moment';
import * as Redis from 'redis';
import 'reflect-metadata';
import { promisify } from 'util';

import {
  CommentModule,
} from '../comment';
import {
  CommentAddedEvent,
  CommentDeletedEvent,
  createCommentAddedEvent,
  createCommentDeletedEvent,
} from '../comment';
import {
  createDeploymentEvent,
  DeploymentEvent,
} from '../deployment';
import { PersistentEventBus } from '../event-bus';
import {
  ApiBranch,
  ApiProject,
  JsonApiEntity,
  JsonApiHapiPlugin,
  JsonApiModule,
  toApiBranchId,
  toApiCommitId,
  toApiDeploymentId,
} from '../json-api';
import {
  codePushed,
  CodePushedEvent,
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';
import logger from '../shared/logger';
import TokenGenerator from '../shared/token-generator';
import { deploymentEventFilter } from './realtime-hapi-plugin';
import { RealtimeModule } from './realtime-module';
import {
  StreamingCodePushedEvent,
  StreamingCommentDeletedEvent,
  StreamingDeploymentEvent,
} from './types';

function getModule(bus: PersistentEventBus, jsonApiModule: JsonApiModule) {
  const jsonApi = new JsonApiHapiPlugin(jsonApiModule, baseUrl, {} as any, {} as any);
  return new RealtimeModule(jsonApi, bus, logger(undefined, true));
}

function getMockCommentModule() {
  const commentModule = {} as CommentModule;
  commentModule.getCommentCountForDeployment = async (_deploymentId: number) => {
    return 2;
  };
  return commentModule;
}
const tokenGenerator = new TokenGenerator('secret');
let persistence: any = { type: 'inmemory' };

if (process.env.TEST_USE_REDIS) {
  persistence = {
    type: 'redis',
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 16379,
    db: 0,
    prefix: 'charles-testing',
    eventsCollectionName: 'events',
    snapshotsCollectionName: 'snapshots',
  };
}

function getEventBus() {
  return new PersistentEventBus(logger(undefined, false, true), persistence);
}

async function clearDb() {
  if (persistence.type === 'redis') {
    // we need to clear the db manually, otherwise nothing will work
    const client = Redis.createClient(persistence);
    const flushdb = client.flushdb.bind(client) as any;
    const quit = client.quit.bind(client) as any;
    const flushdbAsync = promisify(flushdb);
    const quitAsync = promisify(quit);
    await flushdbAsync();
    await quitAsync();
  }
}

const baseUrl = 'http://localhost:8000';

describe('realtime-hapi-sseModule', () => {

  describe('project events', () => {
    beforeEach(clearDb);

    it('are transformed correctly', async () => {
      const id = 32323423;
      const teamId = 289374928;
      const name = 'foo';
      const description = 'bar';
      const eventConstructors = [projectCreated, projectEdited, projectDeleted];
      const results = await Observable.from(eventConstructors)
        .flatMap(async eventConstructor => {

          // Arrange
          await clearDb();

          const payload = {
            id,
            teamId,
            name,
            description,
          };
          const event = eventConstructor(payload);
          const jsonApiModule = {
            getProject: async (_projectId: number): Promise<ApiProject> => ({
                type: 'project',
                id: _projectId,
                name,
                description,
                path: 'foo',
                latestActivityTimestamp: 'foo',
                activeCommitters: [{
                  name: 'foo',
                  email: 'foo',
                }],
                repoUrl: 'foo',
                token: 'token',
            }),
          } as JsonApiModule;
          const eventBus = getEventBus();
          const sseModule = getModule(eventBus, jsonApiModule);
          const promise = sseModule.getSSEStream().take(1).toPromise();
          // Act
          await eventBus.post(event);
          return promise;

        }, 1)
        .toArray()
        .toPromise();

      results.forEach((sseEvent, i) => {
        const constructor = eventConstructors[i];
        // Assert
        expect(sseEvent.type).to.eq('SSE_' + constructor.type);
        expect(sseEvent.teamId).to.eq(teamId);
        expect(sseEvent.payload).to.exist;

        if (constructor === projectCreated) {
          expect(sseEvent.payload.data.type).to.equal('projects');
          expect(sseEvent.payload.data.id).to.equal(String(id));
          expect(sseEvent.payload.data.attributes.name).to.equal(name);
          expect(sseEvent.payload.data.attributes.description).to.equal(description);
        } else {
          expect(sseEvent.payload.id).to.equal(id);
        }
      });
    });
  });

  describe('CodePushedEvent', () => {
    beforeEach(clearDb);
    const branchName = 'foo-branch-name';
    const projectId = 5;
    const payload: CodePushedEvent = {
      teamId: 5,
      after: {
        id: 'foo-after-id',
      } as any,
      before: {
        id: 'foo-before-id',
      } as any,
      parents: [
        {
          id: 'foo-parent-id',
        } as any,
      ],
      commits: [
        {
          id: 'foo-commit-id',
          message: 'foo-message',
        } as any,
        {
          id: 'bar-commit-id',
          message: 'bar-message',
        } as any,
      ],
      projectId,
      ref: branchName,
    };

    async function testCodePushed(_payload: CodePushedEvent) {
      const jsonApiModule = {
        getBranch: async (_projectId: number, _branchName: string): Promise<ApiBranch> => ({
          type: 'branch',
          name: _branchName,
          project: projectId,
          id: `5-branch`,
        } as any),
        toApiCommit: JsonApiModule.prototype.toApiCommit,
      } as JsonApiModule;
      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, jsonApiModule);

      // Act
      const promise = sseModule.getSSEStream().take(1).toPromise();
      const event = codePushed(_payload);
      eventBus.post(event);
      return await promise;
    }

    it('is transformed correctly when after is not null', async () => {
      // Arrange & Act
      const created = await testCodePushed(payload);

      // Assert
      const createdPayload = created.payload as StreamingCodePushedEvent;
      expect(createdPayload.teamId).to.equal(payload.teamId);
      expect(createdPayload.after).to.equal(toApiCommitId(projectId, payload.after!.id));
      expect(createdPayload.before).to.equal(toApiCommitId(projectId, payload.before!.id));
      expect(createdPayload.parents).to.have.length(1);
      expect(createdPayload.parents[0]).to.equal(toApiCommitId(projectId, payload.parents[0].id));
      expect(createdPayload.commits).to.have.length(2);
      expect(createdPayload.commits[0].id).to.equal(toApiCommitId(projectId, payload.commits[0].id));
      expect(createdPayload.commits[0].type).to.equal('commits');
      expect(createdPayload.commits[0].attributes.message).to.equal(payload.commits[0].message);
    });

    it('is transformed correctly when commits is an empty array', async () => {
      // Arrange & Act
      const created = await testCodePushed({ ...payload, commits: [] });

      // Assert
      const createdPayload = created.payload as StreamingCodePushedEvent;
      expect(createdPayload.commits).to.have.length(0);
    });
  });

  describe('DeploymentEvent', () => {
    beforeEach(clearDb);

    it('is transformed correctly to StreamingDeploymentEvent', async () => {
      const branchName = 'foo-branch-name';
      const projectId = 5;
      const jsonApiModule = new JsonApiModule(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        getMockCommentModule(),
        tokenGenerator,
      );

      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, jsonApiModule);

      // Act
      const payload: DeploymentEvent = {
        teamId: 6,
        deployment: {
          buildStatus: 'pending',
          commit: {
            id: 'foo-commit-id',
          } as any,
          commitHash: 'foo-commit-id',
          projectId,
          ref: branchName,
          projectName: 'foo-project-name',
          id: 6,
        } as any,
        statusUpdate: {} as any,
      };
      const promise = sseModule.getSSEStream().take(1).toPromise();
      const event = createDeploymentEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_DEPLOYMENT_UPDATED');
      const createdPayload = created.payload as StreamingDeploymentEvent;
      expect(createdPayload.teamId).to.equal(payload.teamId);
      expect(createdPayload.project).to.equal(String(projectId));
      expect(createdPayload.branch).to.equal(toApiBranchId(projectId, branchName));
      expect(createdPayload.deployment.id).to.equal(toApiDeploymentId(projectId, 6));
      expect(createdPayload.deployment.type).to.equal('deployments');
      expect(createdPayload.commit).to.equal(toApiCommitId(projectId, payload.deployment.commitHash));
    });
  });

  describe('CommentAddedEvent', () => {
    beforeEach(clearDb);

    it('is transformed correctly to streaming event', async () => {
      const jsonApiModule = {
        toApiComment: JsonApiModule.prototype.toApiComment,
      } as JsonApiModule;
      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, jsonApiModule);

      // Act
      const payload: CommentAddedEvent = {
        teamId: 1,
        projectId: 2,
        createdAt: moment(),
        deploymentId: 3,
        email: 'foo@foomail.com',
        id: 4,
        message: 'foo msg',
        name: 'foo name',
      };
      const promise = sseModule.getSSEStream().take(1).toPromise();
      const event = createCommentAddedEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_COMMENT_ADDED');
      const createdPayload = created.payload as JsonApiEntity;
      expect(createdPayload.attributes.deployment).to.equal('2-3');
      expect(created.teamId).to.equal(payload.teamId);
    });
    it('is filtered by deploymentEventFilter', async () => {
      const jsonApiModule = {
        toApiComment: JsonApiModule.prototype.toApiComment,
      } as JsonApiModule;
      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, jsonApiModule);

      // Act
      const payload: CommentAddedEvent = {
        teamId: 1,
        projectId: 2,
        createdAt: moment(),
        deploymentId: 3,
        email: 'foo@foomail.com',
        id: 4,
        message: 'foo msg',
        name: 'foo name',
      };
      const promise = sseModule.getSSEStream()
        .filter(deploymentEventFilter(1, 2, 3))
        .take(1)
        .toPromise();
      eventBus.post(projectEdited({
        description: 'foo',
        name: 'bar',
        id: 6,
        repoUrl: 'foo',
        teamId: 1,
      }));
      const event = createCommentAddedEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_COMMENT_ADDED');
      const createdPayload = created.payload as JsonApiEntity;
      expect(createdPayload.attributes.deployment).to.equal('2-3');
      expect(created.teamId).to.equal(payload.teamId);
    });
  });

  describe('CommentDeletedEvent', () => {
    beforeEach(clearDb);

    it('is transformed correctly to streaming event', async () => {
      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, {} as any);

      // Act
      const payload: CommentDeletedEvent = {
        teamId: 1,
        projectId: 2,
        deploymentId: 3,
        commentId: 4,
      };
      const promise = sseModule.getSSEStream().take(1).toPromise();
      const event = createCommentDeletedEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_COMMENT_DELETED');
      const createdPayload = created.payload as StreamingCommentDeletedEvent;
      expect(createdPayload.deployment).to.equal('2-3');
      expect(createdPayload.comment).to.equal(String(payload.commentId));
      expect(created.teamId).to.equal(payload.teamId);
    });
    it('is filtered by deploymentEventFilter', async () => {
      const jsonApiModule = {
        toApiComment: JsonApiModule.prototype.toApiComment,
      } as JsonApiModule;
      const eventBus = getEventBus();
      const sseModule = getModule(eventBus, jsonApiModule);

      // Act
      const payload: CommentDeletedEvent = {
        teamId: 1,
        projectId: 2,
        deploymentId: 3,
        commentId: 4,
      };
      const promise = sseModule.getSSEStream()
        .filter(deploymentEventFilter(1, 2, 3))
        .take(1)
        .toPromise();
      eventBus.post(projectEdited({
        description: 'foo',
        name: 'bar',
        id: 6,
        repoUrl: 'foo',
        teamId: 1,
      }));
      const event = createCommentDeletedEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_COMMENT_DELETED');
      const createdPayload = created.payload as StreamingCommentDeletedEvent;
      expect(createdPayload.deployment).to.equal('2-3');
      expect(createdPayload.comment).to.equal(String(payload.commentId));
      expect(created.teamId).to.equal(payload.teamId);
    });

  });

});
