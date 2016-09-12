const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

const deepcopy = require('deepcopy');

import {
  ApiActivity,
  ApiBranch,
  ApiCommit,
  ApiDeployment,
  ApiEntities,
  ApiEntity,
  ApiProject,
} from './types';

export function standardIdRef(_: any, item: any) {
  return String(item.id);
}

export const nonIncludedSerialization = {
  ref: standardIdRef,
  included: false,
};

export const branchSerialization = {
  attributes: ['name', 'description', 'project', 'commits', 'project', 'deployments', 'minardJson'],
  ref: standardIdRef,
  commits: nonIncludedSerialization,
  project: nonIncludedSerialization,
  deployments: nonIncludedSerialization,
  included: true,
};

export const deploymentSerialization =  {
  attributes: ['status', 'commit', 'url', 'creator', 'screenshot'],
  ref: standardIdRef,
  commit: nonIncludedSerialization,
  included: true,
};

export const projectSerialization = {
  attributes: ['name', 'description', 'branches', 'activeCommitters'],
  branches: nonIncludedSerialization,
  ref: standardIdRef,
  included: true,
};

export const commitSerialization = {
  attributes: ['message', 'author', 'committer', 'hash', 'deployments'],
  ref: standardIdRef,
  deployments: nonIncludedSerialization,
  included: true,
};

export const activitySerialization = {
  attributes: ['timestamp', 'activityType', 'deployment', 'project', 'branch'],
  ref: standardIdRef,
  deployment: nonIncludedSerialization,
  branch: nonIncludedSerialization,
  project: nonIncludedSerialization,
  included: true,
};

export const branchCompoundSerialization = deepcopy(branchSerialization);

branchCompoundSerialization.commits = commitSerialization;
branchCompoundSerialization.deployments = deploymentSerialization;
branchCompoundSerialization.project = projectSerialization;

export const projectCompoundSerialization = deepcopy(projectSerialization);
projectCompoundSerialization.branches = branchSerialization;

export const deploymentCompoundSerialization = deepcopy(deploymentSerialization);
deploymentCompoundSerialization.commit = commitSerialization;

export const activityCompoundSerialization = deepcopy(activitySerialization);
activityCompoundSerialization.deployment = deploymentCompoundSerialization;
activityCompoundSerialization.branch = branchSerialization;
activityCompoundSerialization.project = projectSerialization;

export function branchToJsonApi(branch: ApiBranch | ApiBranch[]) {
  const serialized = new Serializer('branch',
    branchCompoundSerialization).serialize(branch);
  return serialized;
}

export function deploymentToJsonApi(deployment: ApiDeployment | ApiDeployment[]) {
  const serialized = new Serializer('deployment',
    deploymentCompoundSerialization).serialize(deployment);
  return serialized;
};

export function projectToJsonApi(project: ApiProject | ApiProject[]) {
  const serialized = new Serializer('project',
    projectCompoundSerialization).serialize(project);
  return serialized;
};

export function commitToJsonApi(commit: ApiCommit | ApiCommit[]) {
  return new Serializer('commit', commitSerialization)
    .serialize(commit);
}

export function activityToJsonApi(activity: ApiActivity | ApiActivity[]) {
  return new Serializer('activity', activityCompoundSerialization)
    .serialize(activity);
}
interface Serializers {
  [propName: string]: any;
}
const serializers: Serializers = {
  'activity': new Serializer('activity', activityCompoundSerialization),
  'commit': new Serializer('commit', commitSerialization),
  'project': new Serializer('project', projectCompoundSerialization),
  'deployment': new Serializer('deployment', deploymentCompoundSerialization),
  'branch': new Serializer('branch', branchCompoundSerialization),
};

export function serializeApiEntity(type: string, entity: ApiEntity | ApiEntities) {
  const serializer = serializers[type];
  if (!serializer) {
    throw new Error(`Can't serialize ${type}`);
  }
  return serializer.serialize(entity);
}
