export const authServerBaseUrlInjectSymbol = Symbol('auth-server-base-url');
export const gitlabRootPasswordInjectSymbol = Symbol('gitlab-root-password');
export const jwtOptionsInjectSymbol = Symbol('token-verify-options');

export interface AccessToken {
  iss: string;
  sub: string;
  aud: string[];
  azp: string;
  exp: number;
  iat: number;
  scope: string;
  'https://sub_email'?: string;
  'https://team_token'?: string;
}
