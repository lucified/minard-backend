
import 'reflect-metadata';

import { expect } from 'chai';

import {
  MinardBranch,
  MinardProject,
} from '../project/';

import {
  ApiProject,
  JsonApiModule,
} from './';

describe('json-api-module', () => {

  describe('toApiProject()', () => {
    it('should work in typical case', async () => {
      // Arrange
      // -------
      const minardProject = {
        id: 1,
        branches: [
          {
            name: 'master',
          } as MinardBranch,
        ],
      } as MinardProject;

      const api = {} as JsonApiModule;
      api.toApiProject = JsonApiModule.prototype.toApiProject.bind(api);
      api.toApiBranch = async function(project: ApiProject, branch: MinardBranch) {
        expect(project.id).to.equal('1');
        return {
          id: '1-master',
          deployments: [{}, {}],
        };
      };

      // Act
      // ---
      const project = await api.toApiProject(minardProject);

      // Assert
      // ------
      expect(project.id).to.equal('1');
      // Make sure branches are converted to APIBranch:es
      expect(project.branches[0].id).to.equal('1-master');
      expect(project.branches[0].deployments).to.have.length(2);
    });
  });

});
