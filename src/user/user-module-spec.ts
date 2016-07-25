
import { getPrivateAuthenticationToken } from './user-module';
import { expect } from 'chai';

// TODO: use mocked db for this unit test

describe('user-module', () => {
  it('getGitlabPrivateToken', (done) => {
    getPrivateAuthenticationToken(1).then(token => {
      expect(token).to.equal('GG3TDoKuXXJVFw8nmQ7G');
      done();
    });
  });
});
