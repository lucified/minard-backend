
const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line


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

