
import { expect } from 'chai';
import 'reflect-metadata';

import { EventBus, LocalEventBus } from '../event-bus';
import { ApiProject, JsonApiHapiPlugin } from '../json-api';
import { isType } from '../shared/events';
import LoggerConstructor from '../shared/logger';
import { RealtimeHapiPlugin } from './realtime-hapi-plugin';

import {
  projectCreated,
  projectDeleted,
  projectEdited,
} from '../project';

function getPlugin(bus: EventBus, factory: any) {
  const jsonApi = new JsonApiHapiPlugin(factory, baseUrl);
  return new RealtimeHapiPlugin(jsonApi, bus, LoggerConstructor(undefined, true));
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
          }),
        });
        const eventBus = new LocalEventBus();
        const plugin = getPlugin(eventBus, mockFactory);
        const promise = plugin.stream.take(1).toPromise();
        // Act
        eventBus.post(event);
        return promise;

      });
      const results = await Promise.all(promises);
      results.forEach((result, i) => {
        // Assert
        expect(isType(result, eventConstructors[i])).to.be.true;
        expect(result.payload).to.exist;

        expect(result.payload.data.type).to.equal('projects');
        expect(result.payload.data.id).to.equal(String(projectId));
        expect(result.payload.data.attributes.name).to.equal(name);
        expect(result.payload.data.attributes.description).to.equal(description);

      });
    });
  });
});
