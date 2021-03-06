const Serializer = require('jsonapi-serializer').Serializer;
const deepcopy = require('deepcopy');

import {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiEntities,
  ApiEntity,
} from './types';

export function standardIdRef(_: any, item: any) {
  return String(item.id);
}

export function directIdRef(_: any, item: any) {
  return item;
}

export function linkRef(_: any, _item: any) {
  return 'dummy-id';
}

export const nonIncludedSerialization = {
  ref: standardIdRef,
  included: false,
};

export const deploymentSerialization = {
  attributes: [
    'status',
    'commit',
    'url',
    'creator',
    'screenshot',
    'buildStatus',
    'extractionStatus',
    'screenshotStatus',
    'commentCount',
    'token',
  ],
  ref: standardIdRef,
  included: true,
};

export const commitSerialization = {
  attributes: ['message', 'author', 'committer', 'hash', 'deployments'],
  ref: standardIdRef,
  deployments: deploymentSerialization,
  included: true,
};

export const notificationSerialization = {
  attributes: [
    'type',
    'flowToken',
    'projectId',
    'teamId',
    'hipchatRoomId',
    'hipchatAuthToken',
    'slackWebhookUrl',
    'githubAppId',
    'githubInstallationId',
    'githubOwner',
    'githubRepo',
  ],
  transform: (record: any) => {
    if (record.projectId != null) {
      record.projectId = String(record.projectId);
    }
    return record;
  },
  ref: standardIdRef,
  included: false,
};

export const branchSerialization = (apiBaseUrl: string) => ({
  attributes: [
    'name',
    'commits',
    'project',
    'latestCommit',
    'latestSuccessfullyDeployedCommit',
    'minardJson',
    'latestActivityTimestamp',
    'token',
  ],
  ref: standardIdRef,
  commits: {
    ignoreRelationshipData: true,
    ref: linkRef,
    relationshipLinks: {
      self: (_record: any, _current: any, parent: any) =>
        `${apiBaseUrl}/branches/${parent.id}/commits`,
    },
  },
  project: {
    ref: directIdRef,
  },
  latestCommit: commitSerialization,
  latestSuccessfullyDeployedCommit: commitSerialization,
  included: true,
  typeForAttribute: (attribute: string) => {
    if (
      attribute === 'latestCommit' ||
      attribute === 'latestSuccessfullyDeployedCommit'
    ) {
      return 'commits';
    }
    return undefined;
  },
});

export const projectSerialization = (apiBaseUrl: string) => {
  return {
    attributes: [
      'name',
      'description',
      'branches',
      'activeCommitters',
      'latestActivityTimestamp',
      'latestSuccessfullyDeployedCommit',
      'repoUrl',
      'token',
      'webhookUrl',
      'isPublic',
    ],
    branches: {
      ignoreRelationshipData: true,
      ref: linkRef,
      relationshipLinks: {
        self: (_record: any, _current: any, parent: any) =>
          `${apiBaseUrl}/projects/${parent.id}/branches`,
      },
    },
    latestSuccessfullyDeployedCommit: commitSerialization,
    ref: standardIdRef,
    included: true,
    typeForAttribute: (attribute: string) => {
      if (attribute === 'latestSuccessfullyDeployedCommit') {
        return 'commits';
      }
      return undefined;
    },
  };
};

export const activitySerialization = {
  attributes: [
    'timestamp',
    'activityType',
    'deployment',
    'project',
    'branch',
    'commit',
    'comment',
  ],
  ref: standardIdRef,
  included: true,
};

export const commentSerialization = {
  attributes: ['email', 'name', 'message', 'deployment', 'createdAt'],
  ref: standardIdRef,
  included: true,
};

export const deploymentCompoundSerialization = deepcopy(
  deploymentSerialization,
);
deploymentCompoundSerialization.commit = commitSerialization;

export function branchToJsonApi(branch: ApiBranch | ApiBranch[]) {
  const serialized = new Serializer('branch', branchSerialization).serialize(
    branch,
  );
  return serialized;
}

export function deploymentToJsonApi(
  deployment: ApiDeployment | ApiDeployment[],
) {
  const serialized = new Serializer(
    'deployment',
    deploymentCompoundSerialization,
  ).serialize(deployment);
  return serialized;
}

export function commitToJsonApi(commit: ApiCommit | ApiCommit[]) {
  return new Serializer('commit', commitSerialization).serialize(commit);
}

export function activityToJsonApi(activity: ApiActivity | ApiActivity[]) {
  return new Serializer('activity', activitySerialization).serialize(activity);
}

function projectSerializer(apiBaseUrl: string) {
  return {
    serialize: (entity: ApiEntity | ApiEntities) => {
      const serializer = new Serializer(
        'project',
        projectSerialization(apiBaseUrl),
      );
      (entity as any).branches = {};
      return serializer.serialize(entity);
    },
  };
}

function branchSerializer(apiBaseUrl: string) {
  return {
    serialize: (entity: ApiEntity | ApiEntities) => {
      const serializer = new Serializer(
        'branch',
        branchSerialization(apiBaseUrl),
      );
      (entity as any).commits = {};
      return serializer.serialize(entity);
    },
  };
}

const serializers: (
  apiBaseUrl: string,
) => { [name: string]: any } = apiBaseUrl => ({
  activity: new Serializer('activity', activitySerialization),
  commit: new Serializer('commit', commitSerialization),
  project: projectSerializer(apiBaseUrl),
  deployment: new Serializer('deployment', deploymentCompoundSerialization),
  branch: branchSerializer(apiBaseUrl),
  notification: new Serializer('notification', notificationSerialization),
  comment: new Serializer('comment', commentSerialization),
});

export function serializeApiEntity(
  type: string,
  entity: ApiEntity | ApiEntities,
  apiBaseUrl: string,
) {
  const _serializers = serializers(apiBaseUrl);
  const serializer = _serializers[type];
  if (!serializer) {
    throw new Error(`Can't serialize ${type}`);
  }
  // prune blank fields
  const pruned = JSON.parse(JSON.stringify(entity));
  return serializer.serialize(pruned);
}
