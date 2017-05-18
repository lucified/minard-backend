/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */
import { expect } from 'chai';

import { JsonApiEntity } from '../json-api/types';
import { NotificationType } from '../notification/types';
import CharlesClient from './charles-client';
import {
  getAccessToken,
  getConfiguration,
  log,
  runCommand,
  sleep,
} from './utils';

const config = getConfiguration(process.env.NODE_ENV);

type TeamType = 'admin' | 'regular' | 'open';
const teamTypes: TeamType[] = ['admin', 'regular', 'open'];

describe('system-integration', () => {
  for (const teamType of teamTypes) {
    const projectName = 'regular-project';
    const notificationIds: number[] = [];
    let client: CharlesClient;

    describe(`user belonging to '${teamType}' team`, () => {

      const auth0Config = config.auth0[teamType];
      let oldProjects: any;
      let deployment: JsonApiEntity | undefined;

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
        expect(oldProjects.data).to.exist;
      });

      it('should be able to delete existing integration test projects', async function () {
        this.timeout(1000 * 30);
        for (const project of oldProjects.data) {
          if (project && project.id) {
            await client.deleteProject(Number(project.id));
          }
        }
      });

      it('should be able to create a project', async function () {
        this.timeout(1000 * 3000);
        const project = await client.createProject(projectName);
        expect(project.data.id).to.exist;
        const repoUrl = project.data.attributes['repo-url'];
        expect(repoUrl).to.exist;
        const projectId = parseInt(project.data.id, 10);
        expect(projectId).to.exist;
      });

      it('should be able to edit a project', async function () {
        this.timeout(1000 * 30);
        const newDescription = 'fooo fooofoofoo';
        const response = await client.editProject({ description: newDescription });
        expect(response.id).to.exist;
        expect(response.attributes.description).to.equal(newDescription);
      });

      it('should be able to create a successful deployment by pushing code', async function () {
        this.timeout(1000 * 60 * 5);
        log('Pushing code');

        const repoFolder = `src/integration-test/blank`;
        const repoUrl = client.getRepoUrlWithCredentials(auth0Config.clientId, auth0Config.gitPassword);
        await runCommand('src/integration-test/setup-repo');
        await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrl);
        await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');

        while (!deployment) {
          try {
            deployment = (await client.getBranches()).included.find((item: any) => item.type === 'deployments');
          } catch (error) {
            log('Waiting for the deployment to be created...');
            await sleep(200);
          }
        }
        while (deployment.attributes.status !== 'success') {
          deployment = await client.getDeployment(deployment.id);
          expect(deployment.attributes.status).to.exist;
          if (['running', 'pending', 'success'].indexOf(deployment.attributes.status) === -1) {
            expect.fail(`Deployment has unexpected status ${deployment.attributes.status}`);
          }
          if (deployment.attributes.status !== 'success') {
            log('Building...');
            await sleep(2000);
          }
        }
        expect(deployment.attributes['build-status']).to.eq('success');
        expect(deployment.attributes['extraction-status']).to.eq('success');
        expect(deployment.attributes['screenshot-status']).to.eq('success');
      });

      it('should be able to fetch the raw deployment webpage', async function () {
        this.timeout(1000 * 30);
        const url = deployment!.attributes.url + '/index.html';
        const response = await client.fetch(url);
        expect(response.status).to.eq(200);
      });

      it('should be able to fetch deployment\'s screenshot', async function () {
        this.timeout(1000 * 60);
        const response = await client.fetch(deployment!.attributes.screenshot);
        expect(response.status).to.eq(200);
      });

      it('should be able to fetch project\'s activity', async function () {
        this.timeout(1000 * 10);
        const activities = (await client.getProjectActivity()).data;
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
            notificationIds.push(response.id);
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
            notificationIds.push(response.id);
          }
        }
      });
    });

    describe.skip('comments', () => {
      it('should be able to add comment for deployment', async function () {
        this.timeout(1000 * 10);
        // const addCommentPayload = {
        //   data: {
        //     type: 'comments',
        //     attributes: {
        //       email: 'foo@fooman.com',
        //       message: 'foo message',
        //       name: 'foo',
        //       deployment: 12,
        //     },
        //   },
        // };
        //  expect(json.data.attributes.message)
        //   .to.equal(addCommentPayload.data.attributes.message);
        // commentId = json.data.id;
        // expect(commentId).to.exist;
      });

      it.skip('should be able to fetch comments for deployment', async function () {
        // logTitle('Fetching comments for deployment');
        // const url = `${charles}/api/comments/deployment/${deploymentId}`;
        // log(`Using URL ${prettyUrl(url)}`);
        // this.timeout(1000 * 10);
        // const ret = await userFetch(url);
        // expect(ret.status).to.equal(200);
        // const json = await ret.json();
        // expect(json.data.length).to.equal(1);
        // expect(json.data[0].attributes.message).to.equal('foo message');
      });

      it.skip('should be able to delete comment for deployment', async function () {
        // logTitle('Deleting comment');
        // this.timeout(1000 * 10);
        // const url = `${charles}/api/comments/${commentId}`;
        // log(`Using URL ${prettyUrl(url)} (with method DELETE)`);
        // const ret = await userFetch(url, { method: 'DELETE' });
        // expect(ret.status).to.equal(200);
      });
    });

    describe('removing notification configuration', () => {
      it('should be able to delete created configurations', async function () {
        this.timeout(1000 * 10);
        for (const id of notificationIds) {
          await client.deleteNotificationConfiguration(id);
          log('Deleted');
        }
      });
    });

    describe.skip('realtime', () => {

      it('should be able to get streaming updates', async function () {
        // logTitle('Streaming');
        // this.timeout(1000 * 30);
        // const newDescription = 'foo bar bar bar foo';
        // const editProjectPayload = {
        //   'data': {
        //     'type': 'projects',
        //     'id': projectId,
        //     'attributes': {
        //       'description': newDescription,
        //     },
        //   },
        // };
        // const firstEventId = await editProjectAndListenToEvent(editProjectPayload);
        // const secondEventId = await editProjectAndListenToEvent(editProjectPayload);
        // await testSSEPersistence(firstEventId, secondEventId, 'PROJECT_EDITED');
      });
    });

  }
});
