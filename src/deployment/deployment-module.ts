
const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

import { getPrivateAuthenticationToken } from '../user/user-module';

export async function fetchDeploymentsFromGitLab(projectId: number) {
  const privateToken = getPrivateAuthenticationToken(1);
  const url = `http://localhost:10080/api/v3/projects/` + `${projectId}/builds?private_token=${privateToken}`;
  const response = await fetch(url);
  return response.json();
};

export async function handleGetDeployments(projectId: number) {
  const gitlabData = await fetchDeploymentsFromGitLab(projectId);
  return gitlabResponseToJsonApi(gitlabData);
}

export function gitlabResponseToJsonApi(gitlabResponse: any) {
  const normalized = normalizeGitLabResponse(gitlabResponse);
  const opts = {
    attributes: ['finished_at', 'status', 'commit', 'user'],
    commit: {
       attributes: ['message'],
       ref: function (_: any, commit: any) {
          return String(commit.id);
       },
    },
    user: {
       attributes: ['username'],
       ref: function (_: any, user: any) {
          return String(user.id);
       },
    },
  };
  const serialized = new Serializer('deployment', opts).serialize(normalized);
  return serialized;
};

export function normalizeGitLabResponse(gitlabResponse: any) {
  return gitlabResponse.map((item: any) => {
    return {
      id: item.id,
      user: {
        id: item.user.id,
        username: item.user.username,
      },
      commit: {
        id: item.commit.id,
        message: item.commit.message,
      },
      finished_at: item.finished_at,
      status: item.status,
    };
  });
};

