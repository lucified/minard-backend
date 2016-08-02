
import 'reflect-metadata';

import { toJsonApi } from './project-json-api';
import { expect } from 'chai';

import { MinardProject } from './project-module';

interface JsonApiResource {
  id: string;
  type: string;
  attributes: any;
  relationships: any;
}

describe('project-module-json-api', () => {
  it('toJsonApi', () => {
    let project: MinardProject;

    project = {
      id: 329,
      name: 'example-project',
      path: 'sepo/example-project',
      branches: [
        {
          id: '329-master',
          name: 'master',
          commits: [
            {
              id: '8ds7f89as7f89sa',
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
            },
            {
              id: 'dsf7a678as697f',
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
            },
          ],
        },
        {
          id: '329-new-layout',
          name: 'new-layout',
          commits: [
            {
              id: 'ds7f679f8a6978f6a789',
              message: 'Try out different layout',
              author: {
                name: 'FooFooFooman',
                email: 'foofoofooman@gmail.com',
                timestamp: '2015-12-24T19:51:21.802Z',
              },
              committer: {
                name: 'BarBarBarman',
                email: 'barbarbarman@gmail.com',
                timestamp: '2015-12-24T20:51:21.802Z',
              },
            },
            {
              id: 'dsaf7as6f7as96',
              message: 'Fix responsiveness of new layout',
              author: {
                name: 'FooFooFooFooman',
                email: 'foofoofoofooman@gmail.com',
                timestamp: '2015-12-24T21:51:21.802Z',
              },
              committer: {
                name: 'BarBarBarBarman',
                email: 'barbarbarbarman@gmail.com',
                timestamp: '2015-12-24T22:51:21.802Z',
              },
            },
          ],
        },
      ],
    };

    const converted = toJsonApi(project);
    const data = converted.data;

    // id and type
    expect(data.id).to.equal('329');
    expect(data.type).to.equal('projects');

    // attributes
    expect(data.attributes.name).to.equal('example-project');

    // branches relationship
    expect(data.relationships.branches).to.exist;
    expect(data.relationships.branches.data).to.have.length(2);

    expect(data.relationships.branches.data[0].id).to.equal('329-master');
    expect(data.relationships.branches.data[1].id).to.equal('329-new-layout');

    expect(data.relationships.branches.data[0].type).to.equal('branches');
    expect(data.relationships.branches.data[1].type).to.equal('branches');

    // included branches
    const branch1 = converted.included
      .find((item: JsonApiResource) => item.type === 'branches' && item.id === '329-master');
    expect(branch1).to.exist;
    expect(branch1.attributes.name).to.equal('master');
    expect(branch1.relationships).to.exist;
    expect(branch1.relationships.commits.data).to.have.length(2);
    expect(branch1.relationships.commits.data[0].id).to.equal('8ds7f89as7f89sa');
    expect(branch1.relationships.commits.data[1].id).to.equal('dsf7a678as697f');

    expect(branch1.relationships.project).to.exist;
    expect(branch1.relationships.project.data).to.exist;
    expect(branch1.relationships.project.data.id).to.equal('329');
    expect(branch1.relationships.project.data.type).to.equal('projects');

    // commits should not be included
    const commitsFound = converted.included.filter((item: JsonApiResource) => item.type === 'commits');
    expect(commitsFound).to.have.length(0, 'Commits should not be included');
  });
});
