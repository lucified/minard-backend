import { fromPairs } from 'lodash';

export function parseGitHubTokens(
  tokensEnv: string,
): { [key: number]: string } {
  if (!tokensEnv) {
    return {};
  }
  const pairs = tokensEnv.split(',');
  return fromPairs(
    pairs.map(pair => {
      const splitted = pair.split('=');
      if (splitted.length !== 2) {
        throw Error(`Invalid github tokens configuration`);
      }
      return [parseInt(splitted[0], 0), splitted[1]];
    }),
  );
}
