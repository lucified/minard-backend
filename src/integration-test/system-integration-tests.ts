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

const charles = process.env.CHARLES ? process.env.CHARLES : 'http://localhost:8000';
const gitserver = process.env.MINARD_GIT_SERVER ? process.env.MINARD_GIT_SERVER : 'http://localhost:10080';

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  let deploymentId: number | undefined;
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
    const url = `${charles}/api/teams/1/projects`;
    log(`Using URL ${prettyUrl(url)}`);
    const ret = await fetch(url);
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
      const ret = await fetch(`${charles}/api/projects/${oldProjectId}`, {
        method: 'DELETE',
      });
      expect(ret.status).to.equal(200);
      log('Delete request OK, waiting for 10 seconds');
      await sleep(10000);
      log('Delete finished');
    } else {
      log('Nothing to delete');
    }
  });

  it('should successfully create project', async function() {
    this.timeout(1000 * 30);
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
    const ret = await fetch(`${charles}/api/projects`, {
      method: 'POST',
      body: JSON.stringify(createProjectPayload),
    });
    expect(ret.status).to.equal(201);
    const json = await ret.json();
    expect(json.data.id).to.exist;
    projectId = json.data.id;
    log(`Project created (projectId: ${projectId})`);
  });

  it('should be able to commit code to repo', async function() {
    logTitle(`Committing code to repo`);
    const repoFolder = 'src/integration-test/blank';
    this.timeout(1000 * 20);

    const credentialsFileContent = gitserver.replace(/:(\d+)$/gi, '%3a$1').replace('//', '//root:12345678@') + '\n';
    fs.writeFileSync(`/tmp/git-credentials`, credentialsFileContent, 'utf-8');
    await runCommand('src/integration-test/setup-repo');
    await runCommand('git', '-C', repoFolder, 'remote', 'add', 'minard', `${gitserver}/root/${projectName}.git`);
    await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
  });

  it('project information should include information on deployment', async function() {
    logTitle(`Fetching info on project`);
    this.timeout(1000 * 30);
    // sleep a to give some time got GitLab
    const url = `${charles}/api/projects/${projectId}`;
    log(`Using URL ${prettyUrl(url)}`);
    while (!deploymentId) {
      const ret = await fetch(url);
      expect(ret.status).to.equal(200);
      const json = await ret.json() as JsonApiResponse;
      const data = json.data as JsonApiEntity;
      expect(data.id).to.equal(projectId);
      const included = json.included as JsonApiEntity[];
      expect(included).to.exist;
      const master = included.find((item: JsonApiEntity) => item.type === 'branches');
      expect(master).to.exist;
      if (master!.relationships.deployments && master!.relationships.deployments.data[0]) {
        deploymentId = master!.relationships.deployments.data[0].id;
        expect(deploymentId).to.exist;
        log(`Deployment id is ${deploymentId}`);
      }
      if (!deploymentId) {
        log('Project did not yet have deployment. Sleeping for 2 seconds');
        await sleep(2000);
      }
    }
  });

  it('deployment should succeed within two minutes', async function() {
    this.timeout(1000 * 60 * 2);
    logTitle('Waiting for deployment to succeed');
    const url = `${charles}/api/deployments/${deploymentId}`;
    log(`Fetching information on deployment from ${prettyUrl(url)}`);
    while (!deployment || deployment.attributes.status !== 'success') {
      const ret = await fetch(url);
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
    expect(deployment.attributes.url).to.exist;
    log(`Fetching deployment from ${prettyUrl(deployment.attributes.url)}`);
    const ret = await fetch(deployment.attributes.url);
    expect(ret.status).to.equal(200);
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
    const ret = await fetch(screenshot);
    expect(ret.status).to.equal(200);
  });

  it('should be able to delete project', async function() {
    this.timeout(1000 * 30);
    logTitle('Deleting the project');
    const ret = await fetch(`${charles}/api/projects/${projectId}`, {
      method: 'DELETE',
    });
    expect(ret.status).to.equal(200);
    log('Project deleted');
  });

  it('cleanup repository', async function() {
    // not a real test, just cleaning up
    // await runCommand('rm', '-rf', 'src/integration-test/blank/.git');
  });

});
