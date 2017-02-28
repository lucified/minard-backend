export const authServerBaseUrlInjectSymbol = Symbol('auth-server-base-url');
export const gitlabRootPasswordInjectSymbol = Symbol('gitlab-root-password');
export const jwtOptionsInjectSymbol = Symbol('token-verify-options');
export const authCookieDomainInjectSymbol = Symbol('auth-cookie-domain');

export const teamTokenClaimKey = 'https://minard.io/team_token';

export interface AccessToken {
  iss: string;
  sub: string;
  aud: string[];
  azp: string;
  exp: number;
  iat: number;
  scope: string;
  email: string;
  'https://minard.io/team_token'?: string;
}
