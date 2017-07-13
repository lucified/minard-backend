import { expect } from 'chai';
import { stringify } from 'querystring';

import AuthenticationModule from '../authentication/authentication-module';
import { ProjectModule } from '../project';
import Logger from '../shared/logger';

const logger = Logger(undefined, true);
const fetchMock = require('fetch-mock');

import TokenGenerator from '../shared/token-generator';
import GitHubSyncModule from './github-sync-module';

describe('github-sync-module', () => {
  describe('receiveGitHubHook', () => {
    it('should make correct call to git-syncer', async () => {
      // Arrange
      const gitlabHost = 'http://gitlab';
      const gitHubTokens = '3=foo-token,5=bar';
      const gitSyncerBaseUrl = 'http://gitsyncer';
      const projectId = 5;
      const teamId = 3;
      const cloneUrl = 'http://github.com/foo/bar';
      const signatureToken = 'signature-token';

      const payload = { repository: { clone_url: cloneUrl }, ref: 'refs/head/master' };

      const authModule = {} as AuthenticationModule;
      authModule.getRootPassword = () => 'foobar';

      const projectModule = {} as ProjectModule;
      projectModule.getProject = async (_projectId: number) => {
        expect(projectId).to.equal(_projectId);
        return {
          namespacePath: 'foo-team',
          path: 'foo-project',
          teamId,
        } as any;
      };

      const expectedParams = {
        source: cloneUrl,
        target: `http://gitlab/foo-team/foo-project.git`,
        sourceUsername: 'foo-token',
        targetUsername: 'root',
        targetPassword: 'foobar',
      };
      fetchMock.restore();
      const url = `http://gitsyncer/sync-query?${stringify(expectedParams)}`;
      fetchMock.mock(
        url,
        { status: 200 },
        {
          method: 'POST',
        },
      );

      const tokenGenerator = {} as TokenGenerator;
      tokenGenerator.projectWebhookToken = () => signatureToken;

      const plugin = new GitHubSyncModule(
        authModule,
        projectModule,
        fetchMock.fetchMock,
        gitlabHost,
        gitHubTokens,
        gitSyncerBaseUrl,
        tokenGenerator,
        logger,
      );

      // Act
      await plugin.receiveGitHubHook(projectId, signatureToken, payload);

      // Assert
      expect(fetchMock.called()).to.equal(true);
    });

    it('should not call if invalid signature', async () => {
      const tokenGenerator = {} as TokenGenerator;
      tokenGenerator.projectWebhookToken = () => 'foo';
      const plugin = new GitHubSyncModule(
        {} as any,
        {} as any,
        fetchMock.fetchMock,
        '',
        '',
        '',
        tokenGenerator,
        logger,
      );
      fetchMock.restore();

      // Act
      let throwed = false;
      try {
        await plugin.receiveGitHubHook(2, 'bar', { ref: 'refs/head/master' } as any);
      } catch (error) {
        throwed = true;
      }

      // Assert
      expect(throwed).to.equal(true);
      expect(fetchMock.called()).to.equal(false);
    });
  });
});
