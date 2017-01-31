export const authServerBaseUrlInjectSymbol = Symbol('authServerBaseUrl');
export const gitlabRootPasswordInjectSymbol = Symbol('gitlab-root-password');
export const jwtOptionsInjectSymbol = Symbol('token-verify-options');

export interface AccessToken {
  sub: string;
  email: string;
  name: string;
  aud: string[];
  azp: string;
  exp: number;
  iat: number;
  scope: string;
  'https://team_token': string;
  'https://sub_email': string;
}
