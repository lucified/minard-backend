/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */
import { expect } from 'chai';

import { JsonApiEntity } from '../json-api/types';
import { NotificationConfiguration, NotificationType } from '../notification/types';
import CharlesClient from './charles-client';
import { LatestDeployment, NotificationConfigurations, SSE } from './types';
import {
  getEntities,
  getEntity,
  log,
  runCommand,
  withPing,
} from './utils';

export default (
  client: () => Promise<CharlesClient>,
  gitUser: string,
  gitPassword: string,
  notificationConfigurations?: NotificationConfigurations,
  projectName = 'regular-project',
) => {
  const createdNotificationConfigurations: { [id: string]: NotificationConfiguration } = {};

  describe('team-id', () => {
    it('should be able to get the team id', async function () {
      this.timeout(1000 * 30);
      const teamId = await (await client()).getTeamId();
      expect(teamId).to.exist;
    });
  });

  describe('cleanup', () => {

    it('should be able to delete existing integration test projects', async function () {
      this.timeout(1000 * 30);
      const oldProjects = await client()
        .then(x => x.getProjects())
        .then(x => x.toJson())
        .then(x => x.data);
      for (const oldProject of oldProjects!) {
        if (oldProject && oldProject.id) {
          const response = await (await client()).deleteProject(Number(oldProject.id));
          expect(response.status).to.eq(200);
        }
      }
    });
    it('should be able to delete existing notification configurations', async function () {
      // Arrange
      this.timeout(1000 * 20);
      const teamId = await (await client()).getTeamId();

      // Act
      const teamConfigurations = await getEntities(client(), x => x.getTeamNotificationConfigurations(teamId));
      // Assert
      const receivedIds = teamConfigurations.map(entity => Number(entity.id));
      for (const id of receivedIds) {
        const response = await (await client()).deleteNotificationConfiguration(id);
        expect(response.status).to.eq(200);
      }
    });

  });

  describe('projects', () => {

    it('should be able to create a project', async function () {
      this.timeout(1000 * 3000);
      const project = await getEntity(client(), x => x.createProject(projectName));
      expect(project.id).to.exist;
      const repoUrl = project.attributes['repo-url'];
      expect(repoUrl).to.exist;
    });

    it('should be able to get created projects', async function () {
      this.timeout(1000 * 30);
      const _client = await client();
      const projects = await getEntities(client(), x => x.getProjects());
      expect(projects.length).to.eq(1);
      expect(Number(projects[0].id)).to.eq(_client.lastProject!.id);
    });

    it('should be able to edit a project', async function () {
      this.timeout(1000 * 30);
      const newDescription = 'fooo fooofoofoo';
      const response = await getEntity(client(), x => x.editProject({ description: newDescription }));
      expect(response.id).to.exist;
      expect(response.attributes.description).to.equal(newDescription);
    });
  });

  describe('deployments', () => {
    it('should be able to create a successful deployment by pushing code', async function () {
      this.timeout(1000 * 60 * 5);
      log('Pushing code');
      const _client = await client();
      const repoFolder = `src/integration-test/blank`;
      const repoUrl = _client.getRepoUrlWithCredentials(gitUser, gitPassword);
      await runCommand('src/integration-test/setup-repo');
      await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrl);
      await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');

      const eventStream = await _client.teamEvents('DEPLOYMENT_UPDATED');
      const deployment = await withPing(eventStream, 1000, 'Building...')
        .map(event => JSON.parse(event.data).deployment)
        .filter(d => d.attributes.status === 'success')
        .take(1)
        .toPromise();

      expect(deployment!.attributes['build-status']).to.eq('success');
      expect(deployment!.attributes['extraction-status']).to.eq('success');
      expect(deployment!.attributes['screenshot-status']).to.eq('success');
      // Store the deployment in the client
      _client.lastDeployment = {
        ...deployment!.attributes,
        id: deployment!.id,
      };
    });

    it('should be able to fetch the raw deployment webpage', async function () {
      this.timeout(1000 * 30);
      const _client = await client();
      const url = _client.lastDeployment!.url + '/index.html';
      const response = await _client.fetch(url);
      expect(response.status).to.eq(200);
    });

    it('should be able to fetch deployment\'s screenshot', async function () {
      this.timeout(1000 * 60);
      const _client = await client();
      const response = await _client.fetch(_client.lastDeployment!.screenshot);
      expect(response.status).to.eq(200);
    });

    it('should be able to fetch project\'s activity', async function () {
      this.timeout(1000 * 10);
      const activities = await getEntities(client(), x => x.getProjectActivity());
      expect(activities).to.exist;
      expect(activities).to.have.length(1);
      expect(activities[0].attributes['activity-type']).to.equal('deployment');
      expect(activities[0].attributes.deployment.status).to.equal('success');
      expect(Number(activities[0].attributes.project.id)).to.equal((await client()).lastProject!.id);
      expect(activities[0].attributes.project.name).to.equal(projectName);
      expect(activities[0].attributes.commit).to.exist;
      expect(activities[0].attributes.branch.name).to.equal('master');
    });
  });

  describe('configuring notifications', () => {

    function testNotificationConfiguration(
      configuration: NotificationConfiguration,
      response: JsonApiEntity,
    ) {
      const id = Number(response.id);
      expect(Number.isNaN(id)).to.be.false;
      const attributes = response.attributes;
      // Ensure that one or the other is defined
      expect(!!(configuration.projectId || configuration.teamId)).to.be.true;
      if (configuration.teamId) {
        expect(Number(attributes['team-id'])).to.eq(configuration.teamId);
      }
      if (configuration.projectId) {
        expect(Number(attributes['project-id'])).to.eq(configuration.projectId);
      }
      switch (configuration.type) {
        case 'flowdock':
          expect(attributes['flow-token']).to.eq(configuration.flowToken);
          break;
        case 'hipchat':
          expect(attributes['hipchat-room-id']).to.eq(configuration.hipchatRoomId);
          expect(attributes['hipchat-auth-token']).to.eq(configuration.hipchatAuthToken);
          break;
        case 'slack':
          expect(attributes['slack-webhook-url']).to.eq(configuration.slackWebhookUrl);
          break;
      }
      return id;
    }

    it('should be able to configure notifications', async function () {
      if (notificationConfigurations) {
        this.timeout(1000 * 20);
        const projectId = (await client()).lastProject!.id;
        const teamId = await (await client()).getTeamId();
        for (const notificationType of Object.keys(notificationConfigurations)) {
          const notificationConfiguration = notificationConfigurations[notificationType as NotificationType];
          if (notificationConfiguration) {
            const scopes = [{
              teamId: null,
              projectId,
              ...notificationConfiguration,
            }, {
              teamId,
              projectId: null,
              ...notificationConfiguration,
            }];
            for (const scopedConfiguration of scopes) {
              const responseJson = await getEntity(client(), x => x.configureNotification(scopedConfiguration));
              const id = testNotificationConfiguration(scopedConfiguration, responseJson);
              createdNotificationConfigurations[String(id)] = { id, ...scopedConfiguration };
            }
          }
        }
      }
    });

    it('should be able to list configured notifications', async function () {
      // Arrange
      this.timeout(1000 * 20);
      const teamId = await (await client()).getTeamId();
      const projectId = (await client()).lastProject!.id;

      // Act
      const teamConfigurations = await getEntities(client(), x => x.getTeamNotificationConfigurations(teamId));
      const projectConfigurations = await getEntities(client(), x => x.getProjectNotificationConfigurations(projectId));

      // Assert
      const receivedConfigurations = teamConfigurations.concat(projectConfigurations);
      expect(receivedConfigurations.length).to.eq(Object.keys(createdNotificationConfigurations).length);
      for (const responseJson of receivedConfigurations) {
        const id = responseJson.id;
        testNotificationConfiguration(createdNotificationConfigurations[id], responseJson);
      }
    });
  });

  describe('comments', () => {
    let comment: undefined | JsonApiEntity;
    it('should be able to add comment for deployment', async function () {
      this.timeout(1000 * 10);
      const _client = await client();
      const message = 'integration test message';
      const email = 'user@integration.com';
      const name = 'Charles Minard';
      comment = await getEntity(client(), x => x.addComment(_client.lastDeployment!.id, message, name, email));
      expect(comment.attributes.message).to.equal(message);
      expect(comment.id).to.exist;
    });

    it('should be able to fetch comments for deployment', async function () {
      this.timeout(1000 * 10 * 6);
      const _client = await client();
      const comments = await getEntities(client(), x => x.getComments(_client.lastDeployment!.id));
      expect(comments.length).to.equal(1);
      expect(comments[0].attributes.message).to.equal(comment!.attributes.message);
    });

    it('should be able to delete comment for deployment', async function () {
      this.timeout(1000 * 10);
      const response = await (await client()).deleteComment(comment!.id);
      expect(response.status).to.eq(200);
    });
  });

  describe('removing notification configuration', () => {
    it('should be able to delete created configurations', async function () {
      this.timeout(1000 * 10);
      for (const id of Object.keys(createdNotificationConfigurations)) {
        const response = await (await client()).deleteNotificationConfiguration(Number(id));
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
        this.timeout(1000 * 20);
        const _client = await client();
        for (let k = 0; k < numEvents; k++) {
          // Arrange
          const eventStream = withPing(await _client.teamEvents(eventType), 1000, 'Waiting for realtime...');
          const eventPromise = eventStream.take(1).toPromise();
          const newDescription = 'fooo fooofoofoo bababa';

          // Act
          const editPromise = getEntity(client(), x => x.editProject({ description: newDescription }));
          const [editResponse, sseResponse] = await Promise.all([editPromise, eventPromise]);

          // Assert
          expect(sseResponse.type).to.equal(eventType);
          expect(sseResponse.lastEventId).to.exist;
          const event = JSON.parse(sseResponse.data);
          expect(event).to.exist;
          expect(event.id).to.eq(_client.lastProject!.id);
          expect(event.description).to.eq(newDescription);

          expect(editResponse.id).to.exist;
          expect(editResponse.attributes.description).to.equal(newDescription);
          eventResponses[k] = sseResponse;
        }
      });

      it('should be able to request events retrospectively', async function () {
        const eventStream = await (await client()).teamEvents(eventType, eventResponses[0].lastEventId);
        const sseResponse = await eventStream.take(1).toPromise();

        expect(sseResponse.type).to.equal(eventType);
        expect(sseResponse.lastEventId).to.eq(eventResponses[1].lastEventId);
        const event = JSON.parse(sseResponse.data);
        expect(event).to.exist;
        expect(event.id).to.eq((await client()).lastProject!.id);
      });
    });

    describe.skip('deployment scoped events', () => {
      const eventResponses: SSE[] = [];
      const numEvents = 2;
      const eventType = 'COMMENT_ADDED';
      let deployment: LatestDeployment;

      it('should be able to get realtime events', async function () {
        this.timeout(1000 * 20);
        const _client = await client();
        deployment = _client.lastDeployment!;
        for (let k = 0; k < numEvents; k++) {
          // Arrange
          const eventStream = withPing(
            _client.deploymentEvents(eventType, deployment.id, deployment.token),
            1000,
            'Waiting for realtime...',
          );
          const eventPromise = eventStream.take(1).toPromise();
          const message = 'integration test message';
          const email = 'user@integration.com';
          const name = 'Charles Minard';

          // Act
          await (await client()).addComment(deployment.id, message, name, email);
          const sseResponse = await eventPromise;

          // Assert

          expect(sseResponse.type).to.equal(eventType);
          expect(sseResponse.lastEventId).to.exist;
          const event = JSON.parse(sseResponse.data);
          expect(event).to.exist;
          expect(event.attributes.deployment).to.eq(deployment.id);
          expect(event.attributes.message).to.eq(message);
          eventResponses[k] = sseResponse;
        }
      });

      it('should be able to request events retrospectively', async function () {
        this.timeout(1000 * 20);

        const sseResponse = await withPing((await client()).deploymentEvents(
          eventType,
          deployment.id,
          deployment.token,
          eventResponses[0].lastEventId,
        )).take(1).toPromise();

        expect(sseResponse.type).to.equal(eventType);
        expect(sseResponse.lastEventId).to.eq(eventResponses[1].lastEventId);
      });
    });
  });

};
