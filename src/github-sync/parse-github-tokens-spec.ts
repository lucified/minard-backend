import { expect } from 'chai';

import { parseGitHubTokens } from './parse-github-tokens';

describe('parse-github-tokens', () => {
  it('should parse tokens correctly', () => {
    const tokens = '4=sdafsadfasdfas,6=ads9fd9as69';
    const parsed = parseGitHubTokens(tokens);
    expect(parsed[4]).to.equal('sdafsadfasdfas');
    expect(parsed[6]).to.equal('ads9fd9as69');
  });
});
