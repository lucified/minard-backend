import { expect } from 'chai';
import { values } from 'lodash';
import 'reflect-metadata';

import {
  FlowdockNotificationConfiguration,
  HipChatNotificationConfiguration,
  SlackNotificationConfiguration,
} from '../notification';
import {
  ApiActivity,
  ApiBranch,
  ApiComment,
  ApiCommit,
  ApiDeployment,
  ApiProject,
  JsonApiEntity,
  JsonApiResponse,
} from './';
import { serializeApiEntity } from './serialization';

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
  commentCount: 2,
} as ApiDeployment;

const exampleDeploymentTwo = {
  id: '1-2',
  url: 'http://www.foobarbar.com',
  status: 'success',
  creator: {
    name: 'Barwoman',
    email: 'barwoman@gmail.com',
    timestamp: '2015-12-24T17:55:31.198Z',
  },
  commentCount: 4,
} as ApiDeployment;

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
  token: 'token',
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
  timestamp: exampleDeploymentOne.creator!.timestamp,
} as ApiActivity;

const exampleCommentActivity = {
  type: 'activity',
  id: 'dasfsa',
  project: { id: '3', name: 'foo' },
  branch: { id: '3-master', name: 'master' },
  activityType: 'comment',
  deployment: exampleDeploymentOne,
  commit: exampleCommitOne,
  timestamp: exampleDeploymentOne.creator!.timestamp,
  comment: {
    id: '5',
    message: 'foo msg',
    name: 'foo name',
    email: 'foo email',
  },
} as ApiActivity;

const exampleComment: ApiComment = {
  id: 5,
  project: 6,
  email: 'fooman@foomail.com',
  message: 'foo msg',
  name: 'foo name',
  deployment: '9-6',
  createdAt: '2015-18-24T17:55:31.198Z',
};

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
      expect(data.attributes['latest-activity-timestamp']).to.equal(
        project.latestActivityTimestamp,
      );
      expect(data.attributes['repo-url']).to.equal(project.repoUrl);

      // branches relationship
      expect(data.relationships).to.exist;
      expect(data.relationships.branches).to.exist;
      expect(data.relationships.branches.links).to.exist;
      expect(data.relationships.branches.links.self).to.equal(
        `${apiBaseUrl}/projects/${project.id}/branches`,
      );
      expect(data.relationships.branches.data).to.not.exist;

      // latest successfully deployed commit relationship
      expect(data.relationships['latest-successfully-deployed-commit']).to
        .exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data).to
        .exist;
      expect(
        data.relationships['latest-successfully-deployed-commit'].data.id,
      ).to.equal(exampleProject.latestSuccessfullyDeployedCommit!.id);
      expect(
        data.relationships['latest-successfully-deployed-commit'].data.type,
      ).to.equal('commits');

      // included deployment
      expect(converted.included).to.have.length(2);
      const includedDeployment = (converted.included as any).find(
        (item: any) =>
          item.id ===
            project.latestSuccessfullyDeployedCommit!.deployments[0].id &&
          item.type === 'deployments',
      );
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(
        project.latestSuccessfullyDeployedCommit!.deployments[0].id,
      );
      expect(includedDeployment.attributes.url).to.equal(
        project.latestSuccessfullyDeployedCommit!.deployments[0].url,
      );

      // included commit
      const includedCommit = (converted.included as any).find(
        (item: any) =>
          item.id === project.latestSuccessfullyDeployedCommit!.id &&
          item.type === 'commits',
      );
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal(
        project.latestSuccessfullyDeployedCommit!.id,
      );
      expect(includedCommit.attributes.message).to.equal(
        project.latestSuccessfullyDeployedCommit!.message,
      );
    });

    it('should work with minimal project', () => {
      const project: ApiProject = {
        type: 'project',
        id: 125,
        name: 'adsflsafhjl',
        path: 'adsflsafhjl',
        latestActivityTimestamp: '2016-09-01T13:12:32.521+05:30',
        activeCommitters: [],
        description: 'dsafjdsahfj',
        repoUrl: 'http://foo-bar.com/foo/bar.git',
        token: 'token',
        webhookUrl: 'foo-webhook-url',
        isPublic: false,
      };
      const converted = serializeApiEntity('project', project, apiBaseUrl);
      const data = converted.data;

      // id and type
      expect(data.id).to.equal(String(project.id));
      expect(data.type).to.equal('projects');
      expect(data.attributes.name).to.equal(project.name);
      expect(data.attributes['latest-activity-timestamp']).to.equal(
        project.latestActivityTimestamp,
      );
      expect(data.attributes.description).to.equal(project.description);
      expect(data.attributes['repo-url']).to.equal(project.repoUrl);
      expect(data.attributes['webhook-url']).to.equal(project.webhookUrl);
      expect(data.attributes['is-public']).to.equal(false);
    });
  });

  describe('deploymentToJsonApi()', () => {
    it('should work with array of single deployment', () => {
      const deployments = [exampleDeploymentOne];
      const converted = serializeApiEntity(
        'deployment',
        deployments,
        apiBaseUrl,
      ) as any;

      const data = converted.data;
      expect(data).to.have.length(1);

      // id and type
      expect(data[0].id).to.equal('1-1');
      expect(data[0].type).to.equal('deployments');

      // attributes
      expect(data[0].attributes.status).to.equal(exampleDeploymentOne.status);
      expect(data[0].attributes.url).to.equal(exampleDeploymentOne.url);
      expect(data[0].attributes.creator).to.deep.equal(
        exampleDeploymentOne.creator,
      );
      expect(data[0].attributes.screenshot).to.equal(
        exampleDeploymentOne.screenshot,
      );
      expect(data[0].attributes['comment-count']).to.equal(
        exampleDeploymentOne.commentCount,
      );

      // no relationships or includes
      expect(data[0].relationships).to.not.exist;
      expect(converted.included).to.not.exist;
    });
  });

  describe('branchToJsonApi()', () => {
    it('should work with a single branch', () => {
      const branch = exampleMasterBranch;
      const converted = serializeApiEntity(
        'branch',
        branch,
        apiBaseUrl,
      ) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal('1-master');
      expect(data.type).to.equal('branches');

      // attributes
      expect(data.attributes).to.exist;
      expect(data.attributes.name).to.equal('master');
      expect(data.attributes['latest-activity-timestamp']).to.equal(
        branch.latestActivityTimestamp,
      );

      // project relationship
      expect(data.relationships).to.exist;
      expect(data.relationships.project).to.exist;
      expect(data.relationships.project.data).to.exist;
      expect(data.relationships.project.data.id).to.equal(branch.project);
      expect(data.relationships.project.data.type).to.equal('projects');

      // commits relationship
      expect(data.relationships.commits).to.exist;
      expect(data.relationships.commits.links).to.exist;
      expect(data.relationships.commits.links.self).to.equal(
        `${apiBaseUrl}/branches/${branch.id}/commits`,
      );
      expect(data.relationships.commits.data).to.not.exist;

      // latestCommit relationship
      expect(data.relationships['latest-commit']).to.exist;
      expect(data.relationships['latest-commit'].data).to.exist;
      expect(data.relationships['latest-commit'].data.id).to.equal(
        branch.latestCommit.id,
      );
      expect(data.relationships['latest-commit'].data.type).to.equal('commits');

      // included latestCommit
      const includedCommit = (converted.included as any).find(
        (item: any) =>
          item.id === branch.latestCommit.id && item.type === 'commits',
      );
      expect(includedCommit).to.exist;
      expect(includedCommit.id).to.equal(`${branch.latestCommit.id}`);
      expect(includedCommit.attributes.hash).to.equal(branch.latestCommit.hash);

      // included deployment from latestCommit
      const includedDeployment = (converted.included as any).find(
        (item: any) =>
          item.id === branch.latestCommit.deployments[0].id &&
          item.type === 'deployments',
      );
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(
        branch.latestCommit.deployments[0].id,
      );
      expect(includedDeployment.attributes.url).to.equal(
        branch.latestCommit.deployments[0].url,
      );

      // latestSuccessfullyDeployedCommit relationship
      expect(data.relationships['latest-successfully-deployed-commit']).to
        .exist;
      expect(data.relationships['latest-successfully-deployed-commit'].data).to
        .exist;
      expect(
        data.relationships['latest-successfully-deployed-commit'].data.id,
      ).to.equal(branch.latestSuccessfullyDeployedCommit!.id);
      expect(
        data.relationships['latest-successfully-deployed-commit'].data.type,
      ).to.equal('commits');

      // included latestSuccessfullyDeployedCommit
      const includedSuccessCommit = (converted.included as any).find(
        (item: any) =>
          item.id === branch.latestSuccessfullyDeployedCommit!.id &&
          item.type === 'commits',
      );
      expect(includedSuccessCommit).to.exist;
      expect(includedSuccessCommit.id).to.equal(
        `${branch.latestSuccessfullyDeployedCommit!.id}`,
      );
      expect(includedSuccessCommit.attributes.hash).to.equal(
        branch.latestSuccessfullyDeployedCommit!.hash,
      );

      // included deployment from latestSuccessfullyDeployedCommit
      const includedSuccessDeployment = (converted.included as any).find(
        (item: any) =>
          item.id ===
            branch.latestSuccessfullyDeployedCommit!.deployments[0].id &&
          item.type === 'deployments',
      );
      expect(includedSuccessDeployment).to.exist;
      expect(includedSuccessDeployment.id).to.equal(
        branch.latestSuccessfullyDeployedCommit!.deployments[0].id,
      );
      expect(includedSuccessDeployment.attributes.creator).to.deep.equal(
        branch.latestSuccessfullyDeployedCommit!.deployments[0].creator,
      );
    });
  });

  describe('commitToJsonApi()', () => {
    it('should work with a single commit', () => {
      const commit = exampleCommitOne;
      const converted = serializeApiEntity(
        'commit',
        commit,
        apiBaseUrl,
      ) as JsonApiResponse;
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
      expect(data.attributes.author.timestamp).to.equal(
        '2015-12-24T15:51:21.802Z',
      );
      expect(data.attributes.committer.name).to.equal('Barman');
      expect(data.attributes.committer.email).to.equal('barman@gmail.com');
      expect(data.attributes.committer.timestamp).to.equal(
        '2015-12-24T16:51:21.802Z',
      );

      // deployments relationship
      expect(data.relationships.deployments).to.exist;
      expect(data.relationships.deployments.data).to.have.length(1);
      expect(data.relationships.deployments.data[0].id).to.equal(
        commit.deployments[0].id,
      );

      // no extra stuff
      expect(values(data.relationships)).to.have.length(1);
      expect(values(converted.included)).to.have.length(1);

      // included deployment
      const includedDeployment = (converted.included as any).find(
        (item: any) =>
          item.id === commit.deployments[0].id && item.type === 'deployments',
      );
      expect(includedDeployment).to.exist;
      expect(includedDeployment.id).to.equal(commit.deployments[0].id);
      expect(includedDeployment.attributes.url).to.equal(
        commit.deployments[0].url,
      );
    });
  });

  describe('activityToJsonApi()', () => {
    function testActivity(activity: ApiActivity) {
      const converted = serializeApiEntity(
        'activity',
        activity,
        apiBaseUrl,
      ) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(activity.id);
      expect(data.type).to.equal('activities');

      // attributes
      expect(data.attributes.timestamp).to.equal(activity.timestamp);
      expect(data.attributes['activity-type']).to.equal(activity.activityType);
      expect(data.attributes.deployment.id).to.equal(activity.deployment.id);
      expect(data.attributes.deployment.url).to.equal(activity.deployment.url);
      expect(data.attributes.deployment.screenshot).to.equal(
        activity.deployment.screenshot,
      );
      expect(data.attributes.deployment.status).to.equal(
        activity.deployment.status,
      );
      expect(data.attributes.deployment.creator).to.deep.equal(
        activity.deployment.creator,
      );
      expect(data.attributes.project).to.deep.equal(activity.project);
      expect(data.attributes.branch).to.deep.equal(activity.branch);
      expect(data.attributes.commit).to.deep.equal(activity.commit);

      // do not include extra stuff
      expect(converted.included).to.not.exist;
      expect(data.relationships).to.not.exist;
      return data;
    }

    it('should work with a deployment activity', () => {
      const activity = exampleActivity as ApiActivity;
      const data = testActivity(activity);
      expect(data.attributes.email).to.be.undefined;
    });

    it('should work with a comment activity', () => {
      const activity = exampleCommentActivity as ApiActivity;
      const data = testActivity(activity);
      expect(data.attributes.comment).to.deep.equal(activity.comment);
    });
  });

  describe('commentToJsonApi()', () => {
    it('should work with a single comment', () => {
      const comment = exampleComment;
      const converted = serializeApiEntity(
        'comment',
        comment,
        apiBaseUrl,
      ) as JsonApiResponse;
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(String(comment.id));
      expect(data.type).to.equal('comments');

      // attributes
      expect(data.attributes['created-at']).to.equal(comment.createdAt);
      expect(data.attributes.deployment).to.equal(comment.deployment);
      expect(data.attributes.message).to.equal(comment.message);
      expect(data.attributes.email).to.equal(comment.email);
      expect(data.attributes.name).to.equal(comment.name);

      // do not include extra stuff
      expect(converted.included).to.not.exist;
      expect(data.relationships).to.not.exist;
    });
  });

  describe('notificationToJsonApi()', () => {
    it('should work with a flowdock notification', () => {
      const notification: FlowdockNotificationConfiguration = {
        id: 5,
        projectId: 6,
        teamId: null,
        flowToken: 'foo',
        type: 'flowdock',
      };

      const converted: JsonApiResponse = serializeApiEntity(
        'notification',
        notification,
        apiBaseUrl,
      );
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(String(notification.id));
      expect(data.type).to.equal('notifications');

      // attributes
      expect(data.attributes['flow-token']).to.equal(notification.flowToken);
      expect(data.attributes['project-id']).to.equal(
        String(notification.projectId),
      );
      expect(data.attributes.type).to.equal(notification.type);
    });

    it('should work with a hipchat notification', () => {
      const notification: HipChatNotificationConfiguration = {
        id: 5,
        projectId: null,
        teamId: 7,
        hipchatRoomId: 65,
        hipchatAuthToken: 'bar',
        type: 'hipchat',
      } as any;

      const converted: JsonApiResponse = serializeApiEntity(
        'notification',
        notification,
        apiBaseUrl,
      );
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(String(notification.id));
      expect(data.type).to.equal('notifications');

      // attributes
      expect(data.attributes['hipchat-room-id']).to.equal(
        notification.hipchatRoomId,
      );
      expect(data.attributes['hipchat-auth-token']).to.equal(
        notification.hipchatAuthToken,
      );
      expect(data.attributes['team-id']).to.equal(notification.teamId);
      expect(data.attributes.type).to.equal(notification.type);
    });

    it('should work with a Slack notification', () => {
      const notification: SlackNotificationConfiguration = {
        id: 5,
        projectId: null,
        teamId: 7,
        slackWebhookUrl: 'http://fake.slack.url/for/notifications',
        type: 'slack',
      };

      const converted: JsonApiResponse = serializeApiEntity(
        'notification',
        notification,
        apiBaseUrl,
      );
      const data = converted.data as JsonApiEntity;
      expect(data).to.exist;

      // id and type
      expect(data.id).to.equal(String(notification.id));
      expect(data.type).to.equal('notifications');

      // attributes
      expect(data.attributes['slack-webhook-url']).to.equal(
        notification.slackWebhookUrl,
      );
      expect(data.attributes['team-id']).to.equal(notification.teamId);
      expect(data.attributes.type).to.equal(notification.type);
    });
  });
});
