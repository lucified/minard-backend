export const authServerBaseUrlInjectSymbol = Symbol('auth-server-base-url');
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
  'https://sub_email': string;
}
