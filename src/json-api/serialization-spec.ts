
import 'reflect-metadata';

import { values } from 'lodash';

import {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiProject,
  JsonApiEntity,
  JsonApiResponse,
} from './';

import { serializeApiEntity } from './serialization';

import { expect } from 'chai';

const apiBaseUrl = 'http://localhost:8000/api';

const exampleDeploymentOne = {
  id: '1-1',
  url: 'http://www.foobar.com',
  screenshot: 'http://foo.com/screenshot/1/1',
  status: 'success',
  creator: {
    name: 'Fooman',
    email: 'fooman@gmail.com',
    timestamp: '2015-12-24T17:54:31.198Z',
  },
} as {} as ApiDeployment;

const exampleDeploymentTwo = {
  id: '1-2',
  url: 'http://www.foobarbar.com',
  finished_at: '2015-12-24T19:54:31.198Z',
  status: 'success',
  creator: {
    name: 'Barwoman',
    email: 'barwoman@gmail.com',
    timestamp: '2015-12-24T17:55:31.198Z',
  },
} as {} as ApiDeployment;

const exampleCommitOne = {
  id: '1-8ds7f89as7f89sa',
  hash: '8ds7f89as7f89sa',
  message: 'Remove unnecessary logging',
  author: {
    name: 'Fooman',
    email: 'fooman@gmail.com',
    timestamp: '2015-12-24T15:51:21.802Z',
  },
  committer: {
    name: 'Barman',
    email: 'barman@gmail.com',
    timestamp: '2015-12-24T16:51:21.802Z',
  },
  deployments: [exampleDeploymentOne],
} as ApiCommit;

const exampleCommitTwo = {
  id: '1-dsf7a678as697f',
  hash: '8ds7f89as7f89sa',
  message: 'Improve colors',
  author: {
    name: 'FooFooman',
    email: 'foofooman@gmail.com',
    timestamp: '2015-12-24T17:51:21.802Z',
  },
  committer: {
    name: 'BarBarman',
    email: 'barbarman@gmail.com',
    timestamp: '2015-12-24T18:51:21.802Z',
  },
  deployments: [exampleDeploymentTwo],
} as ApiCommit;

const exampleMasterBranch: ApiBranch = {
  type: 'branch',
  project: 4,
  id: '1-master',
  name: 'master',
  latestCommit: exampleCommitOne,
  latestSuccessfullyDeployedCommit: exampleCommitTwo,
  minardJson: {
    parsed: {
      publicRoot: 'foo',
    },
  },
  latestActivityTimestamp: '2019-18-24T17:55:31.198Z',
};

const exampleProject = {
  type: 'project',
  description: 'foo',
  id: 1,
  name: 'example-project',
  path: 'sepo/example-project',
  latestActivityTimestamp: '2015-18-24T17:55:31.198Z',
  latestSuccessfullyDeployedCommit: exampleCommitOne,
  activeCommitters: [
    {
      name: 'fooman',
      email: 'fooma@barmail.com',
    },
  ],
  repoUrl: 'http://foo-bar.com/foo/bar.git',
} as ApiProject;

exampleCommitOne.deployments = [exampleDeploymentOne];
exampleCommitTwo.deployments = [exampleDeploymentTwo];

const exampleActivity = {
  type: 'activity',
  id: 'dasfsa',
  project: { id: '3', name: 'foo' },
  branch: { id: '3-master', name: 'master' },
  activityType: 'deployment',
  deployment: exampleDeploymentOne,
  commit: exampleCommitOne,
  timestamp: exampleDeploymentOne.finished_at,
} as ApiActivity;

describe('json-api serialization', () => {

  describe('projectToJsonApi()', () => {

    it('should work with complex project', () => {
      const project = exampleProject;
      const converted = serializeApiEntity('project', project, apiBaseUrl);
      const data = converted.data;

      // id and type
      expect(data.id).to.equal('1');
      expect(data.type).to.equal('projects');

      // attributes
      expect(data.attributes.name).to.equal('example-project');
      expect(data.attributes['latest-activity-timestamp']).to.equal(project.latestActivityTimestamp);
      expect(data.attributes['repo-url']).to.equal(project.repoUrl);

      // branches relationship
      expect(data.relationships).to.exist;
      expect(data.relationships.branches).to.exist;
      expect(data.relationships.branches.links).to.exist;
      expect(data.relationships.branches.links.self).to.equal(`${apiBaseUrl}/projects/${project.id}/branches`);
      expect(data.relationships.branches.data).to.not.exist;

      // latest successfully deployed commit relationship
      expect(data.relationships['latest-successfully-deployed-commit']).to.exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data).to.exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data.id)
        .to.equal(exampleProject.latestSuccessfullyDeployedCommit!.id);
      expect(data.relationships['latest-successfully-deployed-commit'].data.type).to.equal('commits');

      // included deployment
      expect(converted.included).to.have.length(2);
      const includedDeployment = (<any> converted.included).find((item: any) =>
          item.id === project.latestSuccessfullyDeployedCommit!.deployments[0].id && item.type === 'deployments');
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(project.latestSuccessfullyDeployedCommit!.deployments[0].id);
      expect(includedDeployment.attributes.url).to.equal(project.latestSuccessfullyDeployedCommit!.deployments[0].url);

      // included commit
      const includedCommit = (<any> converted.included).find((item: any) =>
          item.id === project.latestSuccessfullyDeployedCommit!.id && item.type === 'commits');
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal(project.latestSuccessfullyDeployedCommit!.id);
      expect(includedCommit.attributes.message).to.equal(project.latestSuccessfullyDeployedCommit!.message);
    });

    it('should work with minimal project', () => {
      const project: ApiProject = {
        'type': 'project',
        'id': 125,
        'name': 'adsflsafhjl',
        'path': 'adsflsafhjl',
        'latestActivityTimestamp': '2016-09-01T13:12:32.521+05:30',
        'activeCommitters': [],
        'description': 'dsafjdsahfj',
        'repoUrl': 'http://foo-bar.com/foo/bar.git',
      };
      const converted = serializeApiEntity('project', project, apiBaseUrl);
      const data = converted.data;

      // id and type
      expect(data.id).to.equal(String(project.id));
      expect(data.type).to.equal('projects');
      expect(data.attributes.name).to.equal(project.name);
      expect(data.attributes['latest-activity-timestamp']).to.equal(project.latestActivityTimestamp);
      expect(data.attributes.description).to.equal(project.description);
      expect(data.attributes['repo-url']).to.equal(project.repoUrl);
    });

  });

  describe('deploymentToJsonApi()', () => {
    it('should work with array of single deployment', () => {
      const deployments = [exampleDeploymentOne];
      const converted = serializeApiEntity('deployment', deployments, apiBaseUrl) as any;

      const data = converted.data;
      expect(data).to.have.length(1);

      // id and type
      expect(data[0].id).to.equal('1-1');
      expect(data[0].type).to.equal('deployments');

      // attributes
      expect(data[0].attributes.status).to.equal(exampleDeploymentOne.status);
      expect(data[0].attributes.url).to.equal(exampleDeploymentOne.url);
      expect(data[0].attributes.creator).to.deep.equal(exampleDeploymentOne.creator);
      expect(data[0].attributes.screenshot).to.equal(exampleDeploymentOne.screenshot);

      // no relationships or includes
      expect(data[0].relationships).to.not.exist;
      expect(converted.included).to.not.exist;
    });
  });

  describe('branchToJsonApi()', () => {
    it('should work with a single branch', () => {
      const branch = exampleMasterBranch;
      const converted = serializeApiEntity('branch', branch, apiBaseUrl) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal('1-master');
      expect(data.type).to.equal('branches');

      // attributes
      expect(data.attributes).to.exist;
      expect(data.attributes.name).to.equal('master');
      expect(data.attributes['latest-activity-timestamp']).to.equal(branch.latestActivityTimestamp);

      // project relationship
      expect(data.relationships).to.exist;
      expect(data.relationships.project).to.exist;
      expect(data.relationships.project.data).to.exist;
      expect(data.relationships.project.data.id).to.equal(branch.project);
      expect(data.relationships.project.data.type).to.equal('projects');

      // commits relationship
      expect(data.relationships.commits).to.exist;
      expect(data.relationships.commits.links).to.exist;
      expect(data.relationships.commits.links.self).to.equal(`${apiBaseUrl}/branches/${branch.id}/commits`);
      expect(data.relationships.commits.data).to.not.exist;

      // latestCommit relationship
      expect(data.relationships['latest-commit']).to.exist;
      expect(data.relationships['latest-commit'].data).to.exist;
      expect(data.relationships['latest-commit'].data.id)
        .to.equal(branch.latestCommit.id);
      expect(data.relationships['latest-commit'].data.type).to.equal('commits');

      // included latestCommit
      const includedCommit = (<any> converted.included).find((item: any) =>
        item.id === branch.latestCommit.id && item.type === 'commits');
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal(`${branch.latestCommit.id}`);
      expect(includedCommit.attributes.hash).to.equal(branch.latestCommit.hash);

      // included deployment from latestCommit
      const includedDeployment = (<any> converted.included).find((item: any) =>
        item.id === branch.latestCommit.deployments[0].id && item.type === 'deployments');
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(branch.latestCommit.deployments[0].id);
      expect(includedDeployment.attributes.url).to.equal(branch.latestCommit.deployments[0].url);

      // latestSuccessfullyDeployedCommit relationship
      expect(data.relationships['latest-successfully-deployed-commit']).to.exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data).to.exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data.id)
        .to.equal(branch.latestSuccessfullyDeployedCommit!.id);
      expect(data.relationships['latest-successfully-deployed-commit'].data.type).to.equal('commits');

      // included latestSuccessfullyDeployedCommit
      const includedSuccessCommit = (<any> converted.included).find((item: any) =>
        item.id === branch.latestSuccessfullyDeployedCommit!.id && item.type === 'commits');
      expect(includedSuccessCommit).to.exist;
      expect(includedSuccessCommit.id).to.equal(`${branch.latestSuccessfullyDeployedCommit!.id}`);
      expect(includedSuccessCommit.attributes.hash).to.equal(branch.latestSuccessfullyDeployedCommit!.hash);

      // included deployment from latestSuccessfullyDeployedCommit
      const includedSuccessDeployment = (<any> converted.included).find((item: any) =>
        item.id === branch.latestSuccessfullyDeployedCommit!.deployments[0].id && item.type === 'deployments');
      expect(includedSuccessDeployment).to.exist;
      expect(includedSuccessDeployment.id).to.equal(branch.latestSuccessfullyDeployedCommit!.deployments[0].id);
      expect(includedSuccessDeployment.attributes.creator)
        .to.deep.equal(branch.latestSuccessfullyDeployedCommit!.deployments[0].creator);
    });
  });

  describe('commitToJsonApi()', () => {
    it('should work with a single commit', () => {

      const commit = exampleCommitOne;
      const converted = serializeApiEntity('commit', commit, apiBaseUrl) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(commit.id);
      expect(data.type).to.equal('commits');

      // attributes
      expect(data.attributes.hash).to.equal('8ds7f89as7f89sa');
      expect(data.attributes.message).to.equal('Remove unnecessary logging');
      expect(data.attributes.author.name).to.equal('Fooman');
      expect(data.attributes.author.email).to.equal('fooman@gmail.com');
      expect(data.attributes.author.timestamp).to.equal('2015-12-24T15:51:21.802Z');
      expect(data.attributes.committer.name).to.equal('Barman');
      expect(data.attributes.committer.email).to.equal('barman@gmail.com');
      expect(data.attributes.committer.timestamp).to.equal('2015-12-24T16:51:21.802Z');

      // deployments relationship
      expect(data.relationships.deployments).to.exist;
      expect(data.relationships.deployments.data).to.have.length(1);
      expect(data.relationships.deployments.data[0].id).to.equal(commit.deployments[0].id);

      // no extra stuff
      expect(values(data.relationships)).to.have.length(1);
      expect(values(converted.included)).to.have.length(1);

      // included deployment
      const includedDeployment = (<any> converted.included).find((item: any) =>
        item.id === commit.deployments[0].id && item.type === 'deployments');
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(commit.deployments[0].id);
      expect(includedDeployment.attributes.url).to.equal(commit.deployments[0].url);

    });
  });

  describe('activityToJsonApi()', () => {
    it('should work with a single activity', () => {
      const activity = exampleActivity as ApiActivity;
      const converted = serializeApiEntity('activity', activity, apiBaseUrl) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(activity.id);
      expect(data.type).to.equal('activities');

      // attributes
      expect(data.attributes.timestamp).to.equal(activity.timestamp);
      expect(data.attributes['activity-type']).to.equal(activity.activityType);
      expect(data.attributes.deployment).to.deep.equal(activity.deployment);
      expect(data.attributes.project).to.deep.equal(activity.project);
      expect(data.attributes.branch).to.deep.equal(activity.branch);
      expect(data.attributes.commit).to.deep.equal(activity.commit);

      // do not include extra stuff
      expect(converted.included).to.not.exist;
      expect(data.relationships).to.not.exist;
    });
  });

});
