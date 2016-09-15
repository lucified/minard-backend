
import { expect } from 'chai';
import 'reflect-metadata';

import { PersistentEventBus } from '../event-bus';
import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import logger from '../shared/logger';
import { RealtimeHapiPlugin } from './realtime-hapi-plugin';

import {
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

function getPlugin(bus: PersistentEventBus, factory: any) {
  const jsonApi = new JsonApiHapiPlugin(factory, baseUrl);
  return new RealtimeHapiPlugin(jsonApi, bus, logger(undefined, true));
}

function getEventBus() {
  return new PersistentEventBus(logger(undefined, false, true));
}

const baseUrl = 'http://localhost:8000';

describe('realtime-hapi-plugin', () => {

  describe('project events', () => {

    it('are transformed correctly', async () => {
      const projectId = 32323423;
      const teamId = 289374928;
      const name = 'foo';
      const description = 'bar';
      const eventConstructors = [projectCreated, projectEdited, projectDeleted];
      const promises = eventConstructors.map(eventConstructor => {
        // Arrange
        const payload = {
          projectId,
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
        return eventBus.post(event)
          .then(_ => promise);

      });
      const results = await Promise.all(promises);
      results.forEach((sseEvent, i) => {
        const constructor = eventConstructors[i];
        // Assert
        expect(sseEvent.type).to.eq('SSE_' + constructor.type);
        expect(sseEvent.teamId).to.eq(teamId);
        expect(sseEvent.payload).to.exist;

        if (constructor === projectCreated) {
          expect(sseEvent.payload.data.type).to.equal('projects');
          expect(sseEvent.payload.data.id).to.equal(String(projectId));
          expect(sseEvent.payload.data.attributes.name).to.equal(name);
          expect(sseEvent.payload.data.attributes.description).to.equal(description);
        } else {
          expect(sseEvent.payload.projectId).to.equal(projectId);
        }
      });
    });
  });
});
