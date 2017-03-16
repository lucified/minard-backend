import { expect, use } from 'chai';
import 'reflect-metadata';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { get, kernel } from '../config';
import { GitlabClient } from '../shared/gitlab-client';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import CachedAuthenticationHapiPlugin from './cached-authentication-hapi-plugin';

kernel.rebind(AuthenticationHapiPlugin.injectSymbol).to(CachedAuthenticationHapiPlugin);
function getPlugin() {
  return get<AuthenticationHapiPlugin>(AuthenticationHapiPlugin.injectSymbol);
}

describe.only('CachedAuthenticationHapiPlugin', () => {
  let stubs: sinon.SinonStub[];

  beforeEach(async () => {
    stubs = [];
  });
  afterEach(() => {
    stubs.forEach(stub => stub.restore());
  });

  const stubGitlab = (stubber: (api: GitlabClient) => sinon.SinonStub | sinon.SinonStub[]) => {
    const gitlabClient = get<GitlabClient>(GitlabClient.injectSymbol);
    stubs = stubs.concat(stubber(gitlabClient));
    kernel.rebind(GitlabClient.injectSymbol).toConstantValue(gitlabClient);
    return gitlabClient;
  };

  describe('userHasAccessToProject', () => {
    it('should memoize identical calls', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const gitlab = stubGitlab(p => sinon.stub(p, 'getProject')
        .returns(Promise.resolve(null)));

      // Act
      const plugin = await getPlugin();
      const res1 = await plugin.userHasAccessToProject(userName, projectId);
      const res2 = await plugin.userHasAccessToProject(userName, projectId);

      // Assert
      expect(res1).to.eq(res2);
      expect(gitlab.getProject).to.have.been.calledOnce;
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const projectId2 = 2;
      const gitlab = stubGitlab(p => sinon.stub(p, 'getProject')
        .returns(Promise.resolve(null)));

      // Act
      const plugin = await getPlugin();
      const res1 = await plugin.userHasAccessToProject(userName, projectId);
      const res2 = await plugin.userHasAccessToProject(userName, projectId2);

      // Assert
      expect(res1).to.eq(res2);
      expect(gitlab.getProject).to.have.been.calledTwice;
    });
  });
  describe('userHasAccessToTeam', () => {
    it('should memoize identical calls', async () => {
      // Arrange
      const userName = 'foo';
      const teamId = 1;
      const gitlab = stubGitlab(p => sinon.stub(p, 'getGroup')
        .returns(Promise.resolve(null)));

      // Act
      const plugin = await getPlugin();
      const res1 = await plugin.userHasAccessToTeam(userName, teamId);
      const res2 = await plugin.userHasAccessToTeam(userName, teamId);

      // Assert
      expect(res1).to.eq(res2);
      expect(gitlab.getGroup).to.have.been.calledOnce;
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const userName = 'foo';
      const teamId = 1;
      const teamId2 = 2;
      const gitlab = stubGitlab(p => sinon.stub(p, 'getGroup')
        .returns(Promise.resolve(null)));

      // Act
      const plugin = await getPlugin();
      const res1 = await plugin.userHasAccessToTeam(userName, teamId);
      const res2 = await plugin.userHasAccessToTeam(userName, teamId2);

      // Assert
      expect(res1).to.eq(res2);
      expect(gitlab.getGroup).to.have.been.calledTwice;
    });
  });
});
