
const Serializer = require('jsonapi-serializer').Serializer; // tslint:disable-line

export function toJsonApi(obj: any) {
  const opts = {
    attributes: ['name', 'description', 'branches'],
    branches: {
      attributes: ['name', 'description', 'project', 'commits'],
      ref: function (_: any, branch: any) {
          return String(branch.id);
      },
      commits: {
        attributes: ['message', 'author', 'branch'],
        ref: function (_: any, commit: any) {
          return String(commit.id);
        },
      },
    },
  };
  const serialized = new Serializer('project', opts).serialize(obj);
  return serialized;
};
