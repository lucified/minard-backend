/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */
import { Observable } from '@reactivex/rxjs';
import { expect } from 'chai';

import { JsonApiEntity } from '../json-api/types';
import { NotificationType } from '../notification/types';
import CharlesClient from './charles-client';
import { SSE } from './types';
import {
  getAccessToken,
  getConfiguration,
  log,
  runCommand,
} from './utils';

const config = getConfiguration(process.env.NODE_ENV);

type TeamType = 'admin' | 'regular' | 'open';
// const teamTypes: TeamType[] = ['admin', 'regular', 'open'];
const teamTypes: TeamType[] = ['regular'];

describe('system-integration', () => {
  for (const teamType of teamTypes) {
    const projectName = 'regular-project';
    const notificationIds: number[] = [];
    let client: CharlesClient;

    describe(`user belonging to '${teamType}' team`, () => {

      const auth0Config = config.auth0[teamType];
      let oldProjects: JsonApiEntity[] | undefined;
      let deployment: JsonApiEntity | undefined;

      describe('authentication and projects', () => {

        it('should be able to sign in with Auth0', async function () {
          this.timeout(1000 * 30);
          const accessToken = await getAccessToken(auth0Config);
          expect(accessToken).to.exist;
          client = new CharlesClient(config.charles, accessToken);
        });

        it('should be able to get the team id', async function () {
          this.timeout(1000 * 30);
          const teamId = await client.getTeamId();
          expect(teamId).to.exist;
        });

        it('should be able to get own team\'s projects', async function () {
          this.timeout(1000 * 30);
          oldProjects = await client.getProjects();
          expect(oldProjects).to.exist;
        });

        it('should be able to delete existing integration test projects', async function () {
          this.timeout(1000 * 30);
          for (const project of oldProjects!) {
            if (project && project.id) {
              const response = await client.deleteProject(Number(project.id));
              expect(response.status).to.eq(200);
            }
          }
        });

        it('should be able to create a project', async function () {
          this.timeout(1000 * 3000);
          const project = await client.createProject(projectName);
          expect(project.id).to.exist;
          const repoUrl = project.attributes['repo-url'];
          expect(repoUrl).to.exist;
          const projectId = parseInt(project.id, 10);
          expect(projectId).to.exist;
        });

        it('should be able to edit a project', async function () {
          this.timeout(1000 * 30);
          const newDescription = 'fooo fooofoofoo';
          const response = await client.editProject({ description: newDescription });
          expect(response.id).to.exist;
          expect(response.attributes.description).to.equal(newDescription);
        });
      });

      describe('deployments', () => {

        it('should be able to create a successful deployment by pushing code', async function () {
          this.timeout(1000 * 60 * 5);
          log('Pushing code');

          const repoFolder = `src/integration-test/blank`;
          const repoUrl = client.getRepoUrlWithCredentials(auth0Config.clientId, auth0Config.gitPassword);
          await runCommand('src/integration-test/setup-repo');
          await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrl);
          await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');

          const eventStream = await client.teamEvents('DEPLOYMENT_UPDATED');

          const ping = Observable.timer(1000, 1000);
          deployment = await Observable.merge(eventStream, ping)
            .do(event => {
              if (typeof event === 'number') {
                log('Building...');
              }
            })
            .filter(event => typeof event === 'object')
            .map(event => JSON.parse((event as SSE).data).deployment)
            .filter(d => d.attributes.status === 'success')
            .take(1)
            .toPromise();

          expect(deployment!.attributes['build-status']).to.eq('success');
          expect(deployment!.attributes['extraction-status']).to.eq('success');
          // expect(deployment!.attributes['screenshot-status']).to.eq('success');

        });

        it('should be able to fetch the raw deployment webpage', async function () {
          this.timeout(1000 * 30);
          const url = deployment!.attributes.url + '/index.html';
          const response = await client.fetch(url);
          expect(response.status).to.eq(200);
        });

        it.skip('should be able to fetch deployment\'s screenshot', async function () {
          this.timeout(1000 * 60);
          const response = await client.fetch(deployment!.attributes.screenshot!);
          expect(response.status).to.eq(200);
        });

        it('should be able to fetch project\'s activity', async function () {
          this.timeout(1000 * 10);
          const activities = await client.getProjectActivity();
          expect(activities).to.exist;
          expect(activities).to.have.length(1);
          expect(activities[0].attributes['activity-type']).to.equal('deployment');
          expect(activities[0].attributes.deployment.status).to.equal('success');
          expect(Number(activities[0].attributes.project.id)).to.equal(client.lastProject!.id);
          expect(activities[0].attributes.project.name).to.equal(projectName);
          expect(activities[0].attributes.commit).to.exist;
          expect(activities[0].attributes.branch.name).to.equal('master');
        });
      });

      describe('configuring notifications', () => {

        it('should be able to configure team scoped notifications', async function () {
          this.timeout(1000 * 20);
          const teamId = await client.getTeamId();
          for (const notificationType of Object.keys(config.notifications)) {
            const attributes = config.notifications[notificationType as NotificationType];
            if (attributes) {
              const _attributes = {
                teamId,
                projectId: null,
                ...attributes,
              };
              const response = await client.configureNotification(_attributes);
              notificationIds.push(Number(response.id));
            }
          }
        });

        it('should be able to configure project scoped notifications', async function () {
          this.timeout(1000 * 20);
          const teamId = null;
          const projectId = client.lastProject!.id;
          for (const notificationType of Object.keys(config.notifications)) {
            const attributes = config.notifications[notificationType as NotificationType];
            if (attributes) {
              const _attributes = {
                teamId,
                projectId,
                ...attributes,
              };
              const response = await client.configureNotification(_attributes);
              notificationIds.push(Number(response.id));
            }
          }
        });
      });

      describe('comments', () => {
        let comment: undefined | JsonApiEntity;
        it('should be able to add comment for deployment', async function () {
          this.timeout(1000 * 10);
          const message = 'integration test message';
          const email = 'user@integration.com';
          const name = 'Charles Minard';
          comment = await client.addComment(deployment!.id, message, name, email);
          expect(comment.attributes.message).to.equal(message);
          expect(comment.id).to.exist;
        });

        it('should be able to fetch comments for deployment', async function () {
          this.timeout(1000 * 10 * 6);
          const comments = await client.getComments(deployment!.id);
          expect(comments.length).to.equal(1);
          expect(comments[0].attributes.message).to.equal(comment!.attributes.message);
        });

        it('should be able to delete comment for deployment', async function () {
          this.timeout(1000 * 10);
          const response = await client.deleteComment(comment!.id);
          expect(response.status).to.eq(200);
        });
      });

      describe('removing notification configuration', () => {
        it('should be able to delete created configurations', async function () {
          this.timeout(1000 * 10);
          for (const id of notificationIds) {
            const response = await client.deleteNotificationConfiguration(id);
            expect(response.status).to.eq(200);
          }
        });
      });

      describe('realtime', () => {

        describe('team scoped events', () => {
          const eventResponses: SSE[] = [];
          const numEvents = 2;
          const eventType = 'PROJECT_EDITED';
          it('should be able to get realtime events', async function () {
            for (let k = 0; k < numEvents; k++) {
              // Arrange
              const eventStream = await client.teamEvents(eventType);
              const eventPromise = eventStream.take(1).toPromise();
              const newDescription = 'fooo fooofoofoo bababa';

              // Act
              const editPromise = client.editProject({ description: newDescription });
              const [editResponse, sseResponse] = await Promise.all([editPromise, eventPromise]);

              // Assert
              expect(sseResponse.type).to.equal(eventType);
              expect(sseResponse.lastEventId).to.exist;
              const event = JSON.parse(sseResponse.data);
              expect(event).to.exist;
              expect(event.id).to.eq(client.lastProject!.id);
              expect(event.description).to.eq(newDescription);

              expect(editResponse.id).to.exist;
              expect(editResponse.attributes.description).to.equal(newDescription);
              eventResponses[k] = sseResponse;
            }
          });

          it('should be able to request events retrospectively', async function () {
            const eventStream = await client.teamEvents(eventType, eventResponses[0].lastEventId);
            const sseResponse = await eventStream.take(1).toPromise();

            expect(sseResponse.type).to.equal(eventType);
            expect(sseResponse.lastEventId).to.eq(eventResponses[1].lastEventId);
            const event = JSON.parse(sseResponse.data);
            expect(event).to.exist;
            expect(event.id).to.eq(client.lastProject!.id);
          });
        });

        describe.skip('deployment scoped events', () => {
          const eventResponses: SSE[] = [];
          const numEvents = 2;
          const eventType = 'COMMENT_ADDED';
          it('should be able to get realtime events', async function () {
            for (let k = 0; k < numEvents; k++) {
              // Arrange
              const projectId = client.lastProject!.id;

              const eventStream = await client.deploymentEvents(eventType, `${projectId}-${deployment!.id}`, 'token');
              const eventPromise = eventStream.take(1).toPromise();
              const newDescription = 'fooo fooofoofoo bababa';

              // Act
              const editPromise = client.editProject({ description: newDescription });
              const [editResponse, sseResponse] = await Promise.all([editPromise, eventPromise]);

              // Assert
              expect(sseResponse.type).to.equal(eventType);
              expect(sseResponse.lastEventId).to.exist;
              const event = JSON.parse(sseResponse.data);
              expect(event).to.exist;
              expect(event.id).to.eq(client.lastProject!.id);
              expect(event.description).to.eq(newDescription);

              expect(editResponse.id).to.exist;
              expect(editResponse.attributes.description).to.equal(newDescription);
              eventResponses[k] = sseResponse;
            }
          });

          it('should be able to request events retrospectively', async function () {
            const eventStream = await client.teamEvents(eventType, eventResponses[0].lastEventId);
            const sseResponse = await eventStream.take(1).toPromise();

            expect(sseResponse.type).to.equal(eventType);
            expect(sseResponse.lastEventId).to.eq(eventResponses[1].lastEventId);
            const event = JSON.parse(sseResponse.data);
            expect(event).to.exist;
            expect(event.id).to.eq(client.lastProject!.id);
          });
        });
      });
    });
  }
});
