export interface GitHubWebHookPayload {
  // the type has also other fields but
  // we only use this one
  repository: {
    clone_url: string;
  };
  ref?: string;
}

export const gitSyncerBaseUrlInjectSymbol = Symbol('git-syncer-base-url');
