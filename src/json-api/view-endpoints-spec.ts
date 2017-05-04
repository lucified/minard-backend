import * as Boom from 'boom';
import { expect } from 'chai';
import * as moment from 'moment';
import 'reflect-metadata';

import { MINARD_ERROR_CODE } from '../shared/minard-error';

import {
  JsonApiModule,
} from './json-api-module';

import {
  CommentModule,
} from '../comment';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment';

import { ViewEndpoints } from './view-endpoints';

function getMockCommentModule(): CommentModule {
  return {
    getCommentCountForDeployment: async (_deploymentId: number) => 2,
  } as CommentModule;
}

describe('view-endpoints', () => {

  // Arrange
  const projectName = 'foo-project-name';
  const deploymentId = 8;
  const projectId = 9;
  const branch = 'foo';
  const sha = 'foo-commit-sha';

  const minardDeployment: MinardDeployment = {
    id: deploymentId,
    projectId,
    projectName,
    status: 'success',
    commit: {
      id: sha,
      shortId: 'short',
      author: {
        name: 'foo-name',
        email: 'foo-email',
        timestamp: '2022-09-20T09:06:12+03:00',
      },
      committer: {
        name: 'foo-name',
        email: 'foo-email',
        timestamp: '2022-09-20T09:06:12+03:00',
      },
      message: 'foo-message',
    },
    commitHash: sha,
    ref: branch,
    buildStatus: 'success',
    extractionStatus: 'running',
    screenshotStatus: 'running',
    createdAt: moment(),
    teamId: 5,
  };

  function arrange() {
    const deploymentModule = {} as DeploymentModule;
    deploymentModule.getDeployment = async (_deploymentId: number) => {
      expect(_deploymentId).to.equal(deploymentId);
      return minardDeployment;
    };
    const jsonApiModule = new JsonApiModule(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      getMockCommentModule(),
    );
    return new ViewEndpoints(jsonApiModule, deploymentModule, 'foo-base-url');
  }

  it('should work for a typical deployment', async () => {
    // Arrange
    const viewEndpoints = arrange();

    // Act
    const view = await viewEndpoints.getPreview(projectId, deploymentId, sha);

    // Assert
    expect(view).to.exist;
    expect(view!.branch.name).to.equal(minardDeployment.ref);
    expect(view!.branch.id).to.equal('9-foo');
    expect(view!.project.id).to.equal('9');
    expect(view!.project.name).to.equal(projectName);
    expect(view!.deployment.attributes.status).to.equal(minardDeployment.status);
    expect(view!.commit.attributes.message).to.equal(minardDeployment.commit.message);
  });

  it('should return forbidden when sha is invalid', async () => {
    // Arrange
    const viewEndpoints = arrange();

    let err: any;
    try {
      await viewEndpoints.getPreview(projectId, deploymentId, sha + 'foo');
    } catch (_err) {
      err = _err;
    }
    expect(err).to.exist;
    expect((err as Boom.BoomError).isBoom).to.be.true;
    expect((err as Boom.BoomError).output.statusCode).to.equal(MINARD_ERROR_CODE.FORBIDDEN);
  });

});
