import { Observable } from '@reactivex/rxjs';
import * as Redis from 'redis';

import { expect } from 'chai';
import 'reflect-metadata';

import { PersistentEventBus } from '../event-bus';
import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import logger from '../shared/logger';
import { RealtimeHapiPlugin } from './realtime-hapi-plugin';

import { promisify } from '../shared/promisify';

import {
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

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
});
