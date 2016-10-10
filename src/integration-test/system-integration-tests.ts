/* tslint:disable:only-arrow-functions variable-name */

/* The first rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions.
   The second rule needs to be disabled since EventSource is a class
   and using disable-line doesn't work */

import { Observable } from '@reactivex/rxjs';
import { expect } from 'chai';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { keys } from 'lodash';

import { JsonApiEntity, JsonApiResponse } from '../json-api';
import { Response, fetch } from '../shared/fetch';

import * as chalk from 'chalk';

const EventSource = require('eventsource');

interface SSE {
  type: string;
  lastEventId: string;
  data: any;
}

const teamId = process.env.TEAM_ID ? process.env.TEAM_ID : 2;
const flowToken = process.env.FLOWDOCK_FLOW_TOKEN;
const projectFolder = process.env.SYSTEM_TEST_PROJECT ? process.env.SYSTEM_TEST_PROJECT : 'blank';
const charles_credentials = process.env.CHARLES_CREDENTIALS ? process.env.CHARLES_CREDENTIALS + '@' : '';
let charles = process.env.CHARLES ? process.env.CHARLES : 'http://localhost:8000';
const git_password = process.env.GIT_PASSWORD ? process.env.GIT_PASSWORD : '12345678';
const hipchatRoomId = process.env.HIPCHAT_ROOM_ID ? process.env.HIPCHAT_ROOM_ID : 3140019;
const hipchatAuthToken = process.env.HIPCHAT_AUTH_TOKEN ? process.env.HIPCHAT_AUTH_TOKEN : undefined;

const skipDeleteProject = process.env.SKIP_DELETE_PROJECT ? true : false;

charles = charles.replace('//', `//${charles_credentials}`);
console.log(`Project is ${projectFolder}`);
console.log(`Charles is ${charles}`);

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options?: any, retryCount = 5): Promise<Response> {
  for (let i = 0; i < retryCount; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      log(`WARN: Fetch failed for url ${url}. Error message is '${err.message}'`);
      await sleep(2000);
    }
  }
  throw Error(`Fetch failed ${retryCount} times for url ${url}`);
}

async function runCommand(command: string, ...args: string[]): Promise<boolean> {
  let stdio: any = 'inherit';
  return await new Promise<boolean>((resolve, reject) => {
    const child = spawn(command, args, { stdio });
    child.on('close', (code: any) => {
      if (code !== 0) {
        console.log(`process exited with code ${code}`);
        reject(code);
        return;
      }
      resolve(true);
    });
    child.on('error', (err: any) => {
      console.log(`process exited with code ${err}`);
      reject(err);
    });
  });
}

function log(text: string) {
  console.log(`    ${chalk.cyan(text)}`);
}

function logTitle(text: string) {
  console.log(`   ${chalk.magenta(text)}`);
}

function prettyUrl(url: string) {
  return chalk.blue.underline(url);
}

describe('system-integration', () => {

  const projectName = 'integration-test-project';
  const projectCopyName = 'integration-test-project-copy';
  let projectId: number | undefined;
  let copyProjectId: number | undefined;
  let deploymentId: string | undefined;
  let deployment: any;
  let oldProjectId: number | undefined;
  let repoUrl: string | undefined;
  let oldCopyProjectId: number | undefined;

  it('status should be ok', async function() {
    logTitle('Checking that status is ok');
    this.timeout(1000 * 60 * 15);
    const url = `${charles}/status`;
    log(`Requesting status from ${prettyUrl(url)}`);
    let statusOk = false;
    while (!statusOk) {
      statusOk = true;
      try {
        const ret = await fetch(url);
        expect(ret.status).to.equal(200);
        const statuses = await ret.json();
        expect(keys(statuses)).to.have.length(5);
        keys(statuses).forEach(key => {
          log(`${key} has status ${statuses[key].status}`);
          if (statuses[key].status !== 'ok') {
            statusOk = false;
          }
        });
      } catch (err) {
        log(`Error when fetching: ${err.message}`);
        statusOk = false;
      }
      if (!statusOk) {
        log('Status is not OK for all components. Waiting for five seconds.');
        await sleep(5000);
      }
    }
  });

  it('should successfully respond to request for team projects', async function() {
    logTitle('Requesting team projects');
    this.timeout(1000 * 30);
    const url = `${charles}/api/teams/${teamId}/relationships/projects`;
    log(`Using URL ${prettyUrl(url)}`);
    const ret = await fetchWithRetry(url);
    if (ret.status === 404) {
      expect.fail(`Received 404 when getting team projects. Make sure team with id ${teamId} exists`);
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

  async function shouldAllowForDeletingProject(_oldProjectId?: number) {
    if (_oldProjectId) {
      logTitle(`Deleting old integration-test-project (${_oldProjectId})`);
      const ret = await fetchWithRetry(`${charles}/api/projects/${_oldProjectId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Delete request OK');
      await sleep(500);
    } else {
      log('Nothing to delete');
    }
  }

  it('should allow for deleting old integration-test-project', async function() {
    this.timeout(1000 * 30);
    await shouldAllowForDeletingProject(oldProjectId);
  });

  async function shouldSuccessfullyCreateProject(_projectName: string, _templateProjectId?: number) {
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
    while (!_projectId) {
      const ret = await fetchWithRetry(`${charles}/api/projects`, {
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
        repoUrl = json.data.attributes['repo-url'];
        expect(repoUrl).to.exist;
        log(`Repository url for new project is ${repoUrl}`);
        _projectId = parseInt(json.data.id, 10);
        expect(_projectId).to.exist;
      }
    }
    log(`Project created (projectId: ${_projectId})`);
    return _projectId;
  }

  it('should successfully create project', async function() {
    this.timeout(1000 * 60);
    logTitle('Creating project');
    projectId = await shouldSuccessfullyCreateProject(projectName);
  });

  let flowdockNotificationId: number | undefined;
  it('should be able to configure flowdock notification', async function() {
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
    const ret = await fetch(`${charles}/api/notifications`, {
      method: 'POST',
      body: JSON.stringify(createNotificationPayload),
    });
    expect(ret.status).to.equal(201);
    const json = await ret.json();
    flowdockNotificationId = json.data.id;
  });

  let hipchatNotificationId: number | undefined;
  it('should be able to configure Hipchat notification', async function() {
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
          projectId,
          hipchatAuthToken,
          hipchatRoomId,
        },
      },
    };
    const ret = await fetch(`${charles}/api/notifications`, {
      method: 'POST',
      body: JSON.stringify(createNotificationPayload),
    });
    expect(ret.status).to.equal(201);
    const json = await ret.json();
    hipchatNotificationId = json.data.id;
  });

  it('should be able to commit code to repo', async function() {
    logTitle(`Committing code to repo`);
    const repoFolder = `src/integration-test/${projectFolder}`;
    this.timeout(1000 * 20);

    const matches = repoUrl!.match(/^(\S+\/\/[^\/]+)/);
    if (!matches) {
      throw Error('Could not match server url from repo url'); // make typescript happy
    }
    const gitserver = matches[0];
    const gitServerWithCredentials = gitserver.replace(/:(\d+)$/gi, '%3a$1')
      .replace('//', `//root:${encodeURIComponent(git_password)}@`);
    const repoUrlWithCredentials = repoUrl!.replace(gitserver, gitServerWithCredentials);
    await runCommand('src/integration-test/setup-repo');
    await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', repoUrlWithCredentials);
    await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
  });

  it('branch information should include information on deployment', async function() {
    logTitle(`Fetching info on project`);
    this.timeout(1000 * 45);
    // sleep a to give some time got GitLab
    const url = `${charles}/api/projects/${projectId}/relationships/branches`;
    log(`Using URL ${prettyUrl(url)}`);
    while (!deploymentId) {
      const ret = await fetchWithRetry(url);
      expect(ret.status).to.equal(200);
      const json = await ret.json() as JsonApiResponse;
      const data = json.data as JsonApiEntity[];
      expect(data[0].id).to.equal(`${projectId}-master`);
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

  it('deployment should succeed within five minutes', async function() {
    this.timeout(1000 * 60 * 5);
    logTitle('Waiting for deployment to succeed');
    const url = `${charles}/api/deployments/${deploymentId}`;
    log(`Fetching information on deployment from ${prettyUrl(url)}`);
    while (!deployment || deployment.attributes.status !== 'success') {
      const ret = await fetchWithRetry(url, undefined, 999);
      expect(ret.status).to.equal(200);
      const json = await ret.json() as JsonApiResponse;
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

  it('deployment should have accessible web page', async function() {
    logTitle('Checking that deployment has accessible web page');
    this.timeout(1000 * 30);
    await sleep(2000);
    const url = deployment.attributes.url + '/index.html';
    log(`Fetching deployment from ${prettyUrl(url)}`);
    let status = 0;
    while (status !== 200) {
      const ret = await fetchWithRetry(url, 999);
      status = ret.status;
      if (status !== 200) {
        log(`Charles responded with ${status} for deployment request. Waiting for two seconds.`);
        await sleep(200);
      }
    }
  });

  it('deployment should have accessible screenshot', async function() {
    this.timeout(1000 * 60);
    logTitle('Checking that deployment has accessible screenshot');
    let screenshot: string | undefined;
    while (!screenshot) {
      try {
        const ret = await fetch(`${charles}/api/deployments/${deploymentId}`);
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
    screenshot = screenshot.replace('//', `//${charles_credentials}`);
    const ret = await fetchWithRetry(screenshot);
    expect(ret.status).to.equal(200);
  });

  it('project should have activity', async function() {
    logTitle('Fetching project activity');
    this.timeout(1000 * 10);
    await sleep(500);
    const url = `${charles}/api/activity?filter=project[${projectId}]`;
    log(`Fetching activity from ${prettyUrl(url)}`);
    const ret = await fetch(url);
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

  it('should be able to edit project', async function() {
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
    const ret = await fetch(`${charles}/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(editProjectPayload),
    });
    const json = await ret.json();
    expect(ret.status).to.equal(200);
    expect(json.data.id).to.exist;
    expect(json.data.attributes.description).to.equal(editProjectPayload.data.attributes.description);
  });

  it('should be able to get streaming updates', async function() {
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

  async function editProjectAndListenToEvent(editProjectPayload: any) {
    const editRequest = fetch(`${charles}/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(editProjectPayload),
    });

    const eventSource = new EventSource(`${charles}/events/${teamId}`);
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
    const eventSourceInitDict = {headers: {'Last-Event-ID': lastEventId}};
    const eventSource = new EventSource(`${charles}/events/${teamId}`, eventSourceInitDict);
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

  it('should be able to delete configured flowdock notification', async function() {
    this.timeout(1000 * 10);
    if (!flowToken) {
      log('No flowToken defined. Skipping deletion of notification configuration');
      return;
    }
    const ret = await fetchWithRetry(`${charles}/api/notifications/${flowdockNotificationId}`, {
      method: 'DELETE',
    });
    expect(ret.status).to.equal(200);
    log('Notification configuration deleted');
  });

  it('should be able to delete configured hipchat notification', async function() {
    this.timeout(1000 * 10);
    if (!hipchatAuthToken) {
      log('No hipchatAuthToken defined. Skipping deletion of notification configuration');
      return;
    }
    const ret = await fetchWithRetry(`${charles}/api/notifications/${hipchatNotificationId}`, {
      method: 'DELETE',
    });
    expect(ret.status).to.equal(200);
    log('Notification configuration deleted');
  });

  it('should be able to delete old integration-test-project-copy', async function() {
    this.timeout(1000 * 20);
    await shouldAllowForDeletingProject(oldCopyProjectId);
  });

  it('should be able to create project based on template', async function() {
    this.timeout(1000 * 60);
    logTitle('Creating project from template');
    copyProjectId = await shouldSuccessfullyCreateProject(projectCopyName, projectId);
  });

  it('should be able to delete test projects', async function() {
    if (skipDeleteProject) {
      log('Skipping deletion of projects');
      return;
    }
    this.timeout(1000 * 30);
    await shouldAllowForDeletingProject(projectId);
    await shouldAllowForDeletingProject(copyProjectId);
  });

  it('cleanup repository', async function() {
    // not a real test, just cleaning up
    await runCommand('rm', '-rf', `src/integration-test/${projectFolder}/.git`);
  });

});
