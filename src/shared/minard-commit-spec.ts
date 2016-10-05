
import { expect } from 'chai';

import { toMinardCommit } from './minard-commit';

describe('minard-commit', () => {

 describe('toMinardCommit()', () => {
    it('should correctly convert commit with separate author and committer', () => {
      // Arrange
      const gitlabCommit = {
        'id': '6104942438c14ec7bd21c6cd5bd995272b3faff6',
        'short_id': '6104942438c',
        'title': 'Sanitize for network graph',
        'author_name': 'randx',
        'author_email': 'dmitriy.zaporozhets@gmail.com',
        'created_at': '2012-09-20T09:06:12+03:00',
        'message': 'Sanitize for network graph',
        'committed_date': '2012-09-20T09:09:12+03:00',
        'authored_date': '2012-09-20T09:06:12+03:00',
        'committer_name': 'fooman',
        'committer_email': 'foobar@gmail.com',
        'parent_ids': [
          'ae1d9fb46aa2b07ee9836d49862ec4e2c46fbbba',
        ],
        'stats': {
          'additions': 15,
          'deletions': 10,
          'total': 25,
        },
        'status': 'running',
      };

      // Act
      const commit = toMinardCommit(gitlabCommit);

      // Assert
      expect(commit.id).to.equal('6104942438c14ec7bd21c6cd5bd995272b3faff6');
      expect(commit.message).to.equal('Sanitize for network graph');
      expect(commit.author.email).to.equal('dmitriy.zaporozhets@gmail.com');
      expect(commit.author.name).to.equal('randx');
      expect(commit.author.timestamp).to.equal('2012-09-20T09:06:12+03:00');
      expect(commit.committer.email).to.equal('foobar@gmail.com');
      expect(commit.committer.name).to.equal('fooman');
      expect(commit.committer.timestamp).to.equal('2012-09-20T09:09:12+03:00');
      expect(commit.parentIds).to.equal(gitlabCommit.parent_ids);
    });
  });

});
