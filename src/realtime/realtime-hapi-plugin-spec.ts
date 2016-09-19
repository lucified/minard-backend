import { Observable } from '@reactivex/rxjs';
import * as Redis from 'redis';

import { expect } from 'chai';
import 'reflect-metadata';

import { PersistentEventBus } from '../event-bus';

import {
  ApiBranch,
  ApiProject,
  JsonApiHapiPlugin,
  JsonApiModule,
  toApiBranchId,
  toApiCommitId,
  toApiDeploymentId,
} from '../json-api';

import logger from '../shared/logger';
import { RealtimeHapiPlugin } from './realtime-hapi-plugin';

import { promisify } from '../shared/promisify';

import {
  DeploymentEvent,
  createDeploymentEvent,
} from '../deployment';

import {
  CodePushedEvent,
  codePushed,
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

import {
  StreamingCodePushedEvent,
  StreamingDeploymentEvent,
} from './types';

function getPlugin(bus: PersistentEventBus, factory: any) {
  const jsonApi = new JsonApiHapiPlugin(factory, baseUrl);
  return new RealtimeHapiPlugin(jsonApi, bus, logger(undefined, true));
}

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
    await promisify(client.flushdb, client)();
    await promisify(client.quit, client)();
  }
}

const baseUrl = 'http://localhost:8000';

describe('realtime-hapi-plugin', () => {

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
          const mockFactory = () => ({
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
            }),
          });
          const eventBus = getEventBus();
          const plugin = getPlugin(eventBus, mockFactory);
          const promise = plugin.persistedEvents.take(1).toPromise();
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

    it('is transformed correctly when after is not null', async () => {
      const branchName = 'foo-branch-name';
      const projectId = 5;
      const mockFactory = () => ({
        getBranch: async (_projectId: number, _branchName: string): Promise<ApiBranch> => ({
          type: 'branch',
          name: _branchName,
          project: projectId,
          id: `5-branch`,
        } as any),
        toApiCommit: JsonApiModule.prototype.toApiCommit,
      });
      const eventBus = getEventBus();
      const plugin = getPlugin(eventBus, mockFactory);

      // Act
      const payload: CodePushedEvent = {
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
      const promise = plugin.persistedEvents.take(1).toPromise();
      const event = codePushed(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      const createdPayload = created.payload as StreamingCodePushedEvent;
      expect(createdPayload.after).to.equal(toApiCommitId(projectId, payload.after!.id));
      expect(createdPayload.before).to.equal(toApiCommitId(projectId, payload.before!.id));
      expect(createdPayload.parents).to.have.length(1);
      expect(createdPayload.parents[0]).to.equal(toApiCommitId(projectId, payload.parents[0].id));
      expect(createdPayload.commits).to.have.length(2);
      expect(createdPayload.commits[0].id).to.equal(toApiCommitId(projectId, payload.commits[0].id));
      expect(createdPayload.commits[0].type).to.equal('commits');
      expect(createdPayload.commits[0].attributes.message).to.equal(payload.commits[0].message);
    });
  });

<<<<<<< 825364f23e3284b695b0cf583e51d885427f1816
=======

>>>>>>> Add support for converting DeploymentEvents to StreamingDeploymentEvents
  describe('DeploymentEvent', () => {
    beforeEach(clearDb);

    it('is transformed correctly to StreamingDeploymentEvent', async () => {
      const branchName = 'foo-branch-name';
      const projectId = 5;
      const mockFactory = () => ({
        toApiDeployment: JsonApiModule.prototype.toApiDeployment,
      });
      const eventBus = getEventBus();
      const plugin = getPlugin(eventBus, mockFactory);

      // Act
      const payload: DeploymentEvent = {
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
      const promise = plugin.persistedEvents.take(1).toPromise();
      const event = createDeploymentEvent(payload);
      eventBus.post(event);

      const created = await promise;

      // Assert
      expect(created.type).to.equal('SSE_DEPLOYMENT_UPDATED');
      const createdPayload = created.payload as StreamingDeploymentEvent;
      expect(createdPayload.project).to.equal(String(projectId));
      expect(createdPayload.branch).to.equal(toApiBranchId(projectId, branchName));
      expect(createdPayload.deployment.id).to.equal(toApiDeploymentId(projectId, 6));
      expect(createdPayload.deployment.type).to.equal('deployments');
      expect(createdPayload.commit).to.equal(toApiCommitId(projectId, payload.deployment.commitHash));
    });
  });

});
