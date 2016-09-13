/* tslint:disable only-arrow-functions */

/* The rule needs to be disabled as mocha's
   this.timeout(...) does not work with arrow functions */

import 'isomorphic-fetch';

import { expect } from 'chai';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { keys } from 'lodash';

import { JsonApiEntity, JsonApiResponse } from '../json-api';

import * as chalk from 'chalk';

const projectFolder = process.env.SYSTEM_TEST_PROJECT ? process.env.SYSTEM_TEST_PROJECT : 'blank';
const charles = process.env.CHARLES ? process.env.CHARLES : 'http://localhost:8000';
const gitserver = process.env.MINARD_GIT_SERVER ? process.env.MINARD_GIT_SERVER : 'http://localhost:10080';

const skipDeleteProject = process.env.SKIP_DELETE_PROJECT ? true : false;

console.log(`Project is ${projectFolder}`);
console.log(`Charles is ${charles}`);
console.log(`Git server is ${gitserver}`);

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options?: any, retryCount = 5): Promise<IResponse> {
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
  let projectId: number | undefined;
  let deploymentId: string | undefined;
  let deployment: any;
  let oldProjectId: number | undefined;

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
        expect(keys(statuses)).to.have.length(4);
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
    const url = `${charles}/api/teams/1/relationships/projects`;
    log(`Using URL ${prettyUrl(url)}`);
    const ret = await fetchWithRetry(url);
    expect(ret.status).to.equal(200);
    const json = await ret.json();
    expect(json.data).to.exist;
    const project = json.data.find((proj: JsonApiEntity) => proj.attributes.name === projectName) as JsonApiEntity;
    if (project) {
      expect(project.id).to.exist;
      oldProjectId = Number(project.id);
      log(`Found old integration-test-project with id ${oldProjectId}`);
    }
  });

  it('should allow for deleting old integration-test-project', async function() {
    this.timeout(1000 * 30);
    if (oldProjectId) {
      logTitle(`Deleting old integration-test-project (${oldProjectId})`);
      const ret = await fetchWithRetry(`${charles}/api/projects/${oldProjectId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Delete request OK');
      await sleep(500);
    } else {
      log('Nothing to delete');
    }
  });

  it('should successfully create project', async function() {
    this.timeout(1000 * 60);
    logTitle('Creating project');
    const createProjectPayload = {
      'data': {
        'type': 'projects',
        'attributes': {
          'name': projectName,
          'description': 'foo bar',
        },
        'relationships': {
          'team': {
            'data': {
              'type': 'teams',
              'id': 1,
            },
          },
        },
      },
    };
    while (!projectId) {
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
        projectId = json.data.id;
      }
    }
    log(`Project created (projectId: ${projectId})`);
  });

  it('should be able to commit code to repo', async function() {
    logTitle(`Committing code to repo`);
    const repoFolder = `src/integration-test/${projectFolder}`;
    this.timeout(1000 * 20);

    const credentialsFileContent = gitserver.replace(/:(\d+)$/gi, '%3a$1').replace('//', '//root:12345678@') + '\n';
    fs.writeFileSync(`/tmp/git-credentials`, credentialsFileContent, 'utf-8');
    await runCommand('src/integration-test/setup-repo');
    await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', `${gitserver}/root/${projectName}.git`);
    await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
  });

  it('branch information should include information on deployment', async function() {
    logTitle(`Fetching info on project`);
    this.timeout(1000 * 30);
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
    const ret = await fetchWithRetry(screenshot);
    expect(ret.status).to.equal(200);
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

  it('should be able to delete project', async function() {
    if (skipDeleteProject) {
      log('Skipping deletion of project');
      return;
    }
    this.timeout(1000 * 30);
    logTitle('Deleting the project');
    const ret = await fetchWithRetry(`${charles}/api/projects/${projectId}`, {
      method: 'DELETE',
    });
    expect(ret.status).to.equal(200);
    log('Project deleted');
  });

  it('cleanup repository', async function() {
    // not a real test, just cleaning up
    await runCommand('rm', '-rf', `src/integration-test/${projectFolder}/.git`);
  });

});
