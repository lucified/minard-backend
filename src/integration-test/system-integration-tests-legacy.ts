/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */

import { Observable } from '@reactivex/rxjs';
import { expect } from 'chai';
import * as Knex from 'knex';
import { keys } from 'lodash';
import 'reflect-metadata';

import originalFetch from 'node-fetch';
import { generateAndSaveTeamToken, TeamToken } from '../authentication/team-token';
import { bootstrap } from '../config';
import { getSignedAccessToken } from '../config/config-test';
import { JsonApiEntity, JsonApiResponse } from '../json-api';
import { Group, User } from '../shared/gitlab';
import { GitlabClient } from '../shared/gitlab-client';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  Fetch,
  fetchFactory,
  log,
  logTitle,
  prettyUrl,
  runCommand,
  sleep,
} from './utils';
const randomstring = require('randomstring');
const EventSource = require('eventsource');

interface SSE {
  type: string;
  lastEventId: string;
  data: any;
}

const flowToken = process.env.FLOWDOCK_FLOW_TOKEN;
const projectFolder = process.env.SYSTEM_TEST_PROJECT || 'blank';
const openProjectFolder = process.env.SYSTEM_TEST_PROJECT_OPEN || 'blank-open';
const charles = process.env.CHARLES || 'http://localhost:8000';
const git_password = process.env.GIT_PASSWORD || '12345678';
const hipchatRoomId = process.env.HIPCHAT_ROOM_ID || 3140019;
const hipchatAuthToken = process.env.HIPCHAT_AUTH_TOKEN || undefined;
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || undefined;
const skipDeleteProject = !!process.env.SKIP_DELETE_PROJECT;
const kernel = bootstrap('development');
console.log(`Project is ${projectFolder}`);
console.log(`Charles is ${charles}`);

const gitlab = kernel.get<GitlabClient>(GitlabClient.injectSymbol);
const charlesDb = kernel.get<Knex>(charlesKnexInjectSymbol);

describe('system-integration', () => {

  const projectName = 'integration-test-project';
  const projectCopyName = 'integration-test-project-copy';
  const adminTeamName = 'integrationTestAdminTeam';
  const openTeamName = 'integrationTestOpenTeam';
  const randomComponent = randomstring.generate({ length: 5, charset: 'alphanumeric', readable: true });
  const teamName = 'integrationTestTeam' + randomComponent;
  const teamPath = 'integration-test-team-' + randomComponent;

  let adminTeam: Group;
  let admin: User;
  let adminFetch: Fetch;
  let adminFetchWithRetry: Fetch;
  let adminAccessToken: string;
  let userTeam: Group;
  let user: User;
  let userFetch: Fetch;
  let userFetchWithRetry: Fetch;
  let userAccessToken: string;
  let openTeam: Group;
  let openUser: User;
  let openFetch: Fetch;
  let openFetchWithRetry: Fetch;
  let openAccessToken: string;
  let projectId: number | undefined;
  let adminProjectId: number | undefined;
  let openProjectId: number | undefined;
  let copyProjectId: number | undefined;
  let deploymentId: string | undefined;
  let deployment: any;
  let openDeploymentId: string | undefined;
  let openDeployment: any;
  let oldProjectId: number | undefined;
  let repoUrl: string | undefined;
  let adminRepoUrl: string | undefined;
  let openRepoUrl: string | undefined;
  let oldCopyProjectId: number | undefined;
  let commentId: number | undefined;
  let hipchatNotificationId: number | undefined;
  let flowdockNotificationId: number | undefined;
  let slackNotificationId: number | undefined;

  const setup = async() => {
    const groups = await gitlab.getALLGroups();
    for (const group of groups) {
      if (group.name.match(/integration/i)) {
        log(`Deleting group ${group.name}`);
        await gitlab.deleteGroup(group.id);
        await sleep(3000);
      }
    }
    log('Creating the admin team');
    adminTeam = await gitlab.createGroup(adminTeamName, adminTeamName.toLowerCase());
    log('Creating the user team');
    userTeam = await gitlab.createGroup(teamName, teamPath);
    log('Creating the open team');
    openTeam = await gitlab.createGroup(openTeamName, openTeamName.toLocaleLowerCase());
  };

  before(async function () {
    this.timeout(1000 * 120);
    logTitle('Re/creating integration test teams');
    let done = false;
    while (!done) {
      try {
        await setup();
        done = true;
      } catch (error) {
        log(`Sleeping and retrying: ${error.message}`);
        await sleep(2000);
      }
    }
  });

  describe('set up users and teams', () => {

    it('status should be ok', async function () {
      logTitle('Checking that status is ok');
      this.timeout(1000 * 60 * 15);
      const url = `${charles}/status`;
      log(`Requesting status from ${prettyUrl(url)}`);
      let statusOk = false;
      const maxTimes = 3;
      let counter = 0;
      const numStatuses = 6;
      while (!statusOk && counter < maxTimes) {
        try {
          const ret = await originalFetch(url);
          const statuses = await ret.json();
          expect(keys(statuses)).to.have.length(numStatuses);
          statusOk = keys(statuses).reduce((count, key) => {
            const isActive = statuses[key].active === true;
            if (!isActive) {
              log(`${key} is down: ${statuses[key].message}`);
            }
            return isActive ? count + 1 : count;
          }, 0) === numStatuses;
          expect(ret.status).to.equal(200);
        } catch (err) {
          log(`Error when fetching: ${err.message}`);
        }
        if (!statusOk) {
          log('Status is not OK for all components. Waiting for five seconds.');
          await sleep(5000);
        }
        counter++;
      }
    });

    it('should successfully sign up users with team-tokens', async function () {
      this.timeout(1000 * 30);
      logTitle(`Creating an admin user to the admin team ${adminTeam.name}`);
      const adminTeamToken = await generateAndSaveTeamToken(adminTeam.id, charlesDb);
      adminAccessToken = getSignedAccessToken(
        `integration|1${randomComponent}`,
        adminTeamToken.token,
        `admin${randomComponent}@integration.com`,
      );
      adminFetch = fetchFactory(adminAccessToken);
      adminFetchWithRetry = fetchFactory(adminAccessToken, 5);
      let response = await adminFetch(`${charles}/signup`);
      expect(
        response.status,
        // tslint:disable-next-line:max-line-length
        `If you get 401 here, check that you're running the backend with the INTEGRATION_TEST environment variable set to true`,
      ).to.eq(201);
      admin = await response.tryJson<User>();

      logTitle(`Signing up a user to team ${userTeam.name}`);
      const userTeamToken = await (await adminFetch(`${charles}/team-token/${userTeam.id}`, { method: 'POST' }))
        .tryJson<TeamToken>();
      userAccessToken = getSignedAccessToken(
        `integration|2${randomComponent}`,
        userTeamToken.token,
        `user${randomComponent}@integration.com`,
      );
      userFetch = fetchFactory(userAccessToken);
      userFetchWithRetry = fetchFactory(userAccessToken, 5);

      response = await userFetch(`${charles}/signup`);
      expect(response.status).to.eq(201);
      user = await response.tryJson<User>();

      logTitle(`Signing up a user to team ${openTeam.name}`);
      const openTeamToken = await (await adminFetch(`${charles}/team-token/${openTeam.id}`, { method: 'POST' }))
        .tryJson<TeamToken>();
      openAccessToken = getSignedAccessToken(
        `integration|3${randomComponent}`,
        openTeamToken.token,
        `openUser${randomComponent}@integration.com`,
      );
      openFetch = fetchFactory(openAccessToken);
      openFetchWithRetry = fetchFactory(openAccessToken, 5);

      response = await openFetch(`${charles}/signup`);
      expect(response.status).to.eq(201);
      openUser = await response.tryJson<User>();

    });

    it('should successfully respond to request for team projects', async function () {
      logTitle('Requesting team projects');
      this.timeout(1000 * 30);
      const url = `${charles}/api/teams/${userTeam.id}/relationships/projects`;
      log(`Using URL ${prettyUrl(url)}`);
      const ret = await userFetchWithRetry(url);
      if (ret.status === 404) {
        expect.fail(`Received 404 when getting team projects. Make sure team with id ${userTeam.id} exists`);
      }
      expect(ret.status).to.equal(200);
      const json = await ret.json();
      expect(json.data).to.exist;
      const project = json.data.find((proj: JsonApiEntity) =>
        proj.attributes.name === projectName) as JsonApiEntity;
      if (project) {
        expect(project.id).to.exist;
        oldProjectId = Number(project.id);
        log(`Found old integration-test-project with id ${oldProjectId}`);
      }
      const templateProject = json.data.find((proj: JsonApiEntity) =>
        proj.attributes.name === projectCopyName) as JsonApiEntity;
      if (templateProject) {
        expect(templateProject.id).to.exist;
        oldCopyProjectId = Number(templateProject.id);
        log(`Found old integration-test-project-copy with id ${oldCopyProjectId}`);
      }
    });
    it('non-admin user shouldn\'t be able to list other team\'s projects', async function () {
      this.timeout(1000 * 30);
      const url = `${charles}/api/teams/${adminTeam.id}/relationships/projects`;
      const ret = await userFetchWithRetry(url);
      if (ret.status === 404) {
        expect.fail(`Received 404 when getting team projects. Make sure team with id ${userTeam.id} exists`);
      }
      expect(ret.status).to.equal(401);
    });
    it('admin user should be able to list other team\'s projects', async function () {
      this.timeout(1000 * 30);
      const url = `${charles}/api/teams/${userTeam.id}/relationships/projects`;
      const ret = await adminFetchWithRetry(url);
      if (ret.status === 404) {
        expect.fail(`Received 404 when getting team projects. Make sure team with id ${userTeam.id} exists`);
      }
      expect(ret.status).to.equal(200);
    });
  });

  describe('creating and accessing projects', () => {

    it('should allow for deleting old integration-test-project', async function () {
      this.timeout(1000 * 30);
      await shouldAllowForDeletingProject(oldProjectId);
    });

    it('should successfully create user project', async function () {
      this.timeout(1000 * 60);
      logTitle('Creating project');
      const createdProject = await shouldSuccessfullyCreateProject(projectName, userTeam.id);
      projectId = createdProject.projectId;
      repoUrl = createdProject.repoUrl;
    });
    it('should successfully create admin project', async function () {
      this.timeout(1000 * 60);
      logTitle('Creating project');
      const createdProject = await shouldSuccessfullyCreateProject(projectName + 'admin', adminTeam.id);
      adminProjectId = createdProject.projectId;
      adminRepoUrl = createdProject.repoUrl;
    });
    it('should successfully create open project', async function () {
      this.timeout(1000 * 60);
      logTitle('Creating project');
      const createdProject = await shouldSuccessfullyCreateProject(projectName + 'open', openTeam.id);
      openProjectId = createdProject.projectId;
      openRepoUrl = createdProject.repoUrl;
    });
    it('should not allow unauthorized access to team projects', async function () {
      logTitle('Requesting team projects');
      this.timeout(1000 * 30);
      const url = `${charles}/api/teams/${adminTeam.id}/relationships/projects`;
      log(`Using URL ${prettyUrl(url)}`);
      const ret = await userFetchWithRetry(url);
      if (ret.status === 404) {
        expect.fail(`Received 404 when getting team projects. Make sure team with id ${userTeam.id} exists`);
      }
      const text = await ret.text();
      expect(ret.status).to.equal(401, text);
    });
  });
  describe('notifications', () => {

    it('should be able to configure flowdock notifications', async function () {
      this.timeout(1000 * 20);
      if (!flowToken) {
        log('No flowToken defined. Not configuring notifications');
        return;
      }
      logTitle('Creating Flowdock notification configuration');
      const createNotificationPayload = {
        'data': {
          'type': 'notifications',
          'attributes': {
            'type': 'flowdock',
            projectId,
            flowToken,
          },
        },
      };
      const ret = await userFetch(`${charles}/api/notifications`, {
        method: 'POST',
        body: JSON.stringify(createNotificationPayload),
      });
      expect(ret.status).to.equal(201);
      const json = await ret.json();
      flowdockNotificationId = json.data.id;
    });

    it('should be able to configure Hipchat notifications', async function () {
      this.timeout(1000 * 20);
      if (!hipchatAuthToken) {
        log('No hipchatAuthToken defined. Not configuring notifications');
        return;
      }
      logTitle('Creating Hipchat notification configuration');
      const createNotificationPayload = {
        'data': {
          'type': 'notifications',
          'attributes': {
            type: 'hipchat',
            teamId: userTeam.id,
            hipchatAuthToken,
            hipchatRoomId,
          },
        },
      };
      const ret = await userFetch(`${charles}/api/notifications`, {
        method: 'POST',
        body: JSON.stringify(createNotificationPayload),
      });
      expect(ret.status).to.equal(201);
      const json = await ret.json();
      hipchatNotificationId = json.data.id;

      expect(json.data.attributes['hipchat-room-id'])
        .to.equal(createNotificationPayload.data.attributes.hipchatRoomId);
      expect(json.data.attributes['hipchat-auth-token'])
        .to.equal(createNotificationPayload.data.attributes.hipchatAuthToken);
    });

    it('should be able to configure Slack notifications', async function () {
      this.timeout(1000 * 20);
      if (!slackWebhookUrl) {
        log('No slackWebhookUrl defined. Not configuring notifications');
        return;
      }
      logTitle('Creating Slack notification configuration');
      const createNotificationPayload = {
        'data': {
          'type': 'notifications',
          'attributes': {
            type: 'slack',
            teamId: userTeam.id,
            slackWebhookUrl,
          },
        },
      };
      const ret = await userFetch(`${charles}/api/notifications`, {
        method: 'POST',
        body: JSON.stringify(createNotificationPayload),
      });
      expect(ret.status).to.equal(201);
      const json = await ret.json();
      slackNotificationId = json.data.id;

      expect(json.data.attributes['slack-webhook-url'])
        .to.equal(createNotificationPayload.data.attributes.slackWebhookUrl);
    });
  });

  describe('committing, building and deployments', () => {

    it('should be able to commit code to repo', async function () {
      logTitle(`Committing code to repo`);
      const repoFolder = `src/integration-test/${projectFolder}`;
      this.timeout(1000 * 20);

      const matches = repoUrl!.match(/^(\S+\/\/[^\/]+)/);
      if (!matches) {
        throw Error('Could not match server url from repo url'); // make typescript happy
      }
      const gitserver = matches[0];
      const gitServerWithCredentials = gitserver
        .replace('//', `//root:${encodeURIComponent(git_password)}@`);
      const repoUrlWithCredentials = repoUrl!.replace(gitserver, gitServerWithCredentials);
      await runCommand('src/integration-test/setup-repo');
      await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrlWithCredentials);
      await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
    });

    it('should be able to commit code to the open repo', async function () {
      logTitle(`Committing code to repo`);
      const repoFolder = `src/integration-test/${openProjectFolder}`;
      this.timeout(1000 * 20);

      const matches = openRepoUrl!.match(/^(\S+\/\/[^\/]+)/);
      if (!matches) {
        throw Error('Could not match server url from repo url'); // make typescript happy
      }
      const gitserver = matches[0];
      const gitServerWithCredentials = gitserver
        .replace('//', `//root:${encodeURIComponent(git_password)}@`);
      const repoUrlWithCredentials = openRepoUrl!.replace(gitserver, gitServerWithCredentials);
      await runCommand('src/integration-test/setup-repo', openProjectFolder);
      await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrlWithCredentials);
      await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
    });

    it('branch information should include information on deployment', async function () {
      logTitle(`Fetching info on project`);
      this.timeout(1000 * 60 * 2);
      // sleep a to give some time got GitLab
      const url = `${charles}/api/projects/${projectId}/relationships/branches`;
      log(`Using URL ${prettyUrl(url)}`);
      while (!deploymentId) {
        const ret = await userFetchWithRetry(url);
        expect(ret.status).to.equal(200);
        const json = await ret.json() as JsonApiResponse;
        const data = json.data as JsonApiEntity[];
        expect(data[0].id, JSON.stringify(json)).to.equal(`${projectId}-master`);
        const included = json.included as JsonApiEntity[];
        expect(included).to.exist;
        const includedDeployment = included.find((item: JsonApiEntity) => item.type === 'deployments');
        if (includedDeployment) {
          deploymentId = includedDeployment.id;
          log(`Deployment id is ${deploymentId}`);
        }
        if (!deploymentId) {
          log('Project did not yet have deployment. Sleeping for 2 seconds');
          await sleep(2000);
        }
      }
    });

    it('branch information should include information on open deployment', async function () {
      logTitle(`Fetching info on project`);
      this.timeout(1000 * 60 * 2);
      // sleep a to give some time got GitLab
      const url = `${charles}/api/projects/${openProjectId}/relationships/branches`;
      log(`Using URL ${prettyUrl(url)}`);
      while (!openDeploymentId) {
        const ret = await openFetchWithRetry(url);
        expect(ret.status).to.equal(200);
        const json = await ret.json() as JsonApiResponse;
        const data = json.data as JsonApiEntity[];
        expect(data[0].id, JSON.stringify(json)).to.equal(`${openProjectId}-master`);
        const included = json.included as JsonApiEntity[];
        expect(included).to.exist;
        const includedDeployment = included.find((item: JsonApiEntity) => item.type === 'deployments');
        if (includedDeployment) {
          openDeploymentId = includedDeployment.id;
          log(`Deployment id is ${openDeploymentId}`);
        }
        if (!openDeploymentId) {
          log('Project did not yet have deployment. Sleeping for 2 seconds');
          await sleep(2000);
        }
      }
    });

    it('deployment should succeed within five minutes', async function () {
      this.timeout(1000 * 60 * 5);
      logTitle('Waiting for deployment to succeed');
      const url = `${charles}/api/deployments/${deploymentId}`;
      log(`Fetching information on deployment from ${prettyUrl(url)}`);
      while (!deployment || deployment.attributes.status !== 'success') {
        const ret = await fetchFactory(userAccessToken, 999)(url);
        expect(ret.status).to.equal(200);
        const json = await ret.tryJson<JsonApiResponse>();
        deployment = json.data as JsonApiEntity;
        expect(deployment.attributes.status).to.exist;
        if (['running', 'pending', 'success'].indexOf(deployment.attributes.status) === -1) {
          expect.fail(`Deployment has unexpected status ${deployment.attributes.status}`);
        }
        if (deployment.attributes.status !== 'success') {
          log(`Deployment has status ${deployment.attributes.status}. Sleeping for 2 seconds`);
          await sleep(2000);
        }
      }
    });

    it('open deployment should succeed within five minutes', async function () {
      this.timeout(1000 * 60 * 5);
      logTitle('Waiting for deployment to succeed');
      const url = `${charles}/api/deployments/${openDeploymentId}`;
      log(`Fetching information on deployment from ${prettyUrl(url)}`);
      while (!openDeployment || openDeployment.attributes.status !== 'success') {
        const ret = await fetchFactory(openAccessToken, 999)(url);
        expect(ret.status).to.equal(200);
        const json = await ret.tryJson<JsonApiResponse>();
        openDeployment = json.data as JsonApiEntity;
        expect(openDeployment.attributes.status).to.exist;
        if (['running', 'pending', 'success'].indexOf(openDeployment.attributes.status) === -1) {
          expect.fail(`openDeployment has unexpected status ${openDeployment.attributes.status}`);
        }
        if (openDeployment.attributes.status !== 'success') {
          log(`openDeployment has status ${openDeployment.attributes.status}. Sleeping for 2 seconds`);
          await sleep(2000);
        }
      }
    });

    it('deployment should have accessible web page', async function () {
      logTitle('Checking that deployment has accessible web page');
      this.timeout(1000 * 30);
      await sleep(2000);
      const url = deployment.attributes.url + '/index.html';
      log(`Fetching deployment from ${prettyUrl(url)}`);
      let status = 0;
      while (status !== 200) {
        const ret = await userFetch(url);
        status = ret.status;
        if (status !== 200) {
          log(`Charles responded with ${status} for deployment request. Waiting for two seconds.`);
          await sleep(200);
        }
      }
    });

    it('deployment should not have openly accessible web page', async function () {
      logTitle('Checking that deployment is not openly accessible');
      this.timeout(1000 * 30);
      await sleep(2000);
      const url = deployment.attributes.url + '/index.html';
      log(`Fetching deployment from ${prettyUrl(url)}`);
      const response1 = await openFetch(url);
      expect(response1.status).to.equal(401);
      const response2 = await originalFetch(url, { redirect: 'manual' });
      expect(response2.status).to.equal(302);
    });

    it('deployment should have web page that is accessible internally', async function () {
      logTitle('Checking that deployment has web page that is accessible internally');
      this.timeout(1000 * 30);
      await sleep(2000);
      const url = (deployment.attributes.url + '/index.html')
        .replace('localtest.me' , 'internal.localtest.me');
      log(`Fetching deployment from ${prettyUrl(url)}`);
      const response1 = await openFetch(url);
      expect(response1.status).to.equal(200);
    });

    it('open deployment should have openly accessible web page', async function () {
      logTitle('Checking that open deployment has openly accessible web page');
      this.timeout(1000 * 30);
      await sleep(2000);
      const url = openDeployment.attributes.url + '/index.html';
      log(`Fetching deployment from ${prettyUrl(url)}`);
      const response = await fetchFactory(userAccessToken + 'foo')(url); // Give an invalid access token on purpose
      expect(response.status).to.equal(200);
      const response2 = await originalFetch(url, { redirect: 'manual' });
      expect(response2.status).to.equal(200);
    });

    it('deployment should have accessible screenshot', async function () {
      this.timeout(1000 * 60);
      logTitle('Checking that deployment has accessible screenshot');
      let screenshot: string | undefined;
      while (!screenshot) {
        try {
          const ret = await userFetch(`${charles}/api/deployments/${deploymentId}`);
          expect(ret.status).to.equal(200);
          const json = await ret.json() as JsonApiResponse;
          deployment = json.data as JsonApiEntity;
          screenshot = deployment.attributes.screenshot;
        } catch (err) {
          log(`Unexpected error fetching deployments: ${err.message}`);
          console.log(err);
        }
        if (!screenshot) {
          log(`Deployment does not yet have screenshot. Sleeping for 2 seconds`);
          await sleep(2000);
        }
      }
      log(`Fetching screenshot from ${prettyUrl(screenshot)}`);
      const ret = await userFetchWithRetry(screenshot);
      expect(ret.status).to.equal(200);
    });

    it('project should have activity', async function () {
      logTitle('Fetching project activity');
      this.timeout(1000 * 10);
      await sleep(500);
      const url = `${charles}/api/activity?filter=project[${projectId}]`;
      log(`Fetching activity from ${prettyUrl(url)}`);
      const ret = await userFetch(url);
      expect(ret.status).to.equal(200);
      const json = await ret.json();
      expect(json.data).to.exist;
      expect(json.data).to.have.length(1);
      expect(json.data[0].attributes['activity-type']).to.equal('deployment');
      expect(json.data[0].attributes.deployment.status).to.equal('success');
      expect(json.data[0].attributes.project.id).to.equal(String(projectId));
      expect(json.data[0].attributes.project.name).to.equal(projectName);
      expect(json.data[0].attributes.commit).to.exist;
      expect(json.data[0].attributes.branch.name).to.equal('master');
    });

    it('should be able to edit project', async function () {
      logTitle('Editing project');
      this.timeout(1000 * 30);
      const editProjectPayload = {
        'data': {
          'type': 'projects',
          'id': projectId,
          'attributes': {
            'description': 'foo bar bar bar',
          },
        },
      };
      const ret = await userFetch(`${charles}/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(editProjectPayload),
      });
      const json = await ret.json();
      expect(ret.status).to.equal(200);
      expect(json.data.id).to.exist;
      expect(json.data.attributes.description).to.equal(editProjectPayload.data.attributes.description);
    });

    it.skip('should be able to add comment for deployment', async function () {
      logTitle('Adding comment');
      this.timeout(1000 * 10);
      const addCommentPayload = {
        data: {
          type: 'comments',
          attributes: {
            email: 'foo@fooman.com',
            message: 'foo message',
            name: 'foo',
            deployment: deploymentId,
          },
        },
      };
      const ret = await userFetch(`${charles}/api/comments`, {
        method: 'POST',
        body: JSON.stringify(addCommentPayload),
      });
      expect(ret.status).to.equal(201);
      const json = await ret.json();
      expect(json.data.attributes.message)
        .to.equal(addCommentPayload.data.attributes.message);
      commentId = json.data.id;
      expect(commentId).to.exist;
    });

    it.skip('should be able to fetch comments for deployment', async function () {
      logTitle('Fetching comments for deployment');
      const url = `${charles}/api/comments/deployment/${deploymentId}`;
      log(`Using URL ${prettyUrl(url)}`);
      this.timeout(1000 * 10);
      const ret = await userFetch(url);
      expect(ret.status).to.equal(200);
      const json = await ret.json();
      expect(json.data.length).to.equal(1);
      expect(json.data[0].attributes.message).to.equal('foo message');
    });

    it.skip('should be able to delete comment for deployment', async function () {
      logTitle('Deleting comment');
      this.timeout(1000 * 10);
      const url = `${charles}/api/comments/${commentId}`;
      log(`Using URL ${prettyUrl(url)} (with method DELETE)`);
      const ret = await userFetch(url, { method: 'DELETE' });
      expect(ret.status).to.equal(200);
    });

    it('should be able to get streaming updates', async function () {
      logTitle('Streaming');
      this.timeout(1000 * 30);
      const newDescription = 'foo bar bar bar foo';
      const editProjectPayload = {
        'data': {
          'type': 'projects',
          'id': projectId,
          'attributes': {
            'description': newDescription,
          },
        },
      };
      const firstEventId = await editProjectAndListenToEvent(editProjectPayload);
      const secondEventId = await editProjectAndListenToEvent(editProjectPayload);
      await testSSEPersistence(firstEventId, secondEventId, 'PROJECT_EDITED');
    });

    it('should be able to delete configured Flowdock notifications', async function () {
      this.timeout(1000 * 10);
      if (!flowToken) {
        log('No flowToken defined. Skipping deletion of notification configuration');
        return;
      }
      const ret = await userFetchWithRetry(`${charles}/api/notifications/${flowdockNotificationId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Notification configuration deleted');
    });

    it('should be able to delete configured HipChat notifications', async function () {
      this.timeout(1000 * 10);
      if (!hipchatAuthToken) {
        log('No hipchatAuthToken defined. Skipping deletion of notification configuration');
        return;
      }
      const ret = await userFetchWithRetry(`${charles}/api/notifications/${hipchatNotificationId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Notification configuration deleted');
    });

    it('should be able to delete configured Slack notifications', async function () {
      this.timeout(1000 * 10);
      if (!slackWebhookUrl) {
        log('No slackWebhookUrl defined. Skipping deletion of notification configuration');
        return;
      }
      const ret = await userFetchWithRetry(`${charles}/api/notifications/${slackNotificationId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Notification configuration deleted');
    });

    it('should be able to delete old integration-test-project-copy', async function () {
      this.timeout(1000 * 20);
      await shouldAllowForDeletingProject(oldCopyProjectId);
    });

    it('should be able to create project based on template', async function () {
      this.timeout(1000 * 60);
      logTitle('Creating project from template');
      const createdProject = await shouldSuccessfullyCreateProject(projectCopyName, userTeam.id, projectId);
      copyProjectId = createdProject.projectId;
    });

    it('should be able to delete test projects', async function () {
      if (skipDeleteProject) {
        log('Skipping deletion of projects');
        return;
      }
      this.timeout(1000 * 30);
      await shouldAllowForDeletingProject(projectId);
      await shouldAllowForDeletingProject(adminProjectId);
      await shouldAllowForDeletingProject(copyProjectId);
    });

    it('cleanup repository', async function () {
      // not a real test, just cleaning up
      await runCommand('rm', '-rf', `src/integration-test/${projectFolder}/.git`);
    });
  });
  async function shouldSuccessfullyCreateProject(_projectName: string, teamId: number, _templateProjectId?: number) {
    const createProjectPayload = {
      'data': {
        'type': 'projects',
        'attributes': {
          'name': _projectName,
          'description': 'foo bar',
          'templateProjectId': _templateProjectId,
        },
        'relationships': {
          'team': {
            'data': {
              'type': 'teams',
              'id': teamId,
            },
          },
        },
      },
    };
    let _projectId: number | undefined;
    let _repoUrl: string | undefined;
    while (!_projectId) {
      const fetch = (teamId === userTeam.id ? userFetchWithRetry : adminFetchWithRetry) || originalFetch;
      const ret = await fetch(`${charles}/api/projects`, {
        method: 'POST',
        body: JSON.stringify(createProjectPayload),
      });
      if (ret.status === 400) {
        log('Project was not yet fully deleted. Sleeping for two seconds.');
        await sleep(2000);
      } else {
        expect(ret.status).to.equal(201);
        const json = await ret.json();
        expect(json.data.id).to.exist;
        _repoUrl = json.data.attributes['repo-url'];
        expect(_repoUrl).to.exist;
        log(`Repository url for new project is ${_repoUrl}`);
        _projectId = parseInt(json.data.id, 10);
        expect(_projectId).to.exist;
      }
    }
    log(`Project created (projectId: ${_projectId})`);
    return { projectId: _projectId, repoUrl: _repoUrl };
  }

  async function shouldAllowForDeletingProject(_oldProjectId?: number) {
    if (_oldProjectId) {
      logTitle(`Deleting old integration-test-project (${_oldProjectId})`);
      const ret = await adminFetch(`${charles}/api/projects/${_oldProjectId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Delete request OK');
      await sleep(500);
    } else {
      log('Nothing to delete');
    }
  }

  async function editProjectAndListenToEvent(editProjectPayload: any) {
    const editRequest = userFetch(`${charles}/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(editProjectPayload),
    });

    const eventSource = new EventSource(`${charles}/events/${userTeam.id}?token=${userAccessToken}`);
    const eventType = 'PROJECT_EDITED';
    const eventPromise = Observable.fromEventPattern(
      (h: any) => eventSource.addEventListener(eventType, h),
      (h: any) => eventSource.removeListener(eventType, h),
    ).take(1).map(event => <SSE> event).toPromise();

    const [editResponse, sseResponse] = await Promise.all([editRequest, eventPromise]);
    const json = await editResponse.json();
    expect(editResponse.status).to.equal(200);
    expect(json.data.id).to.exist;
    expect(json.data.attributes.description).to.equal(editProjectPayload.data.attributes.description);

    expect(sseResponse.type).to.equal(eventType);
    expect(sseResponse.lastEventId).to.exist;
    const event = JSON.parse(sseResponse.data);
    expect(event).to.exist;
    expect(event.id).to.eq(projectId);
    expect(event.description).to.eq(editProjectPayload.data.attributes.description);

    return sseResponse.lastEventId;
  }

  async function testSSEPersistence(lastEventId: string, currentEventId: string, eventType: string) {
    const eventSourceInitDict = { headers: { 'Last-Event-ID': lastEventId } };
    const eventSource = new EventSource(
      `${charles}/events/${userTeam.id}?token=${userAccessToken}`,
      eventSourceInitDict,
    );
    const sseResponse = await Observable.fromEventPattern(
      (h: any) => eventSource.addEventListener(eventType, h),
      (h: any) => eventSource.removeListener(eventType, h),
    ).take(1).map(event => <SSE> event).toPromise();

    expect(sseResponse.type).to.equal(eventType);
    expect(sseResponse.lastEventId).to.eq(currentEventId);
    const event = JSON.parse(sseResponse.data);
    expect(event).to.exist;
    expect(event.id).to.eq(projectId);
  }
});
