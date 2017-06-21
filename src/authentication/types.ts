import { Request } from '../server/hapi';

export const internalHostSuffixesInjectSymbol = Symbol(
  'internal-host-suffixes',
);
export const auth0DomainInjectSymbol = Symbol('auth0-domain');
export const auth0ClientIdInjectSymbol = Symbol('auth0-client');
export const auth0AudienceInjectSymbol = Symbol('auth0-audience');
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
  username?: string;
  teams?: number[];
  gitlabPassword?: string;
}

export const enum AuthorizationStatus {
  AUTHORIZED = 100,
  UNAUTHORIZED,
  NOT_CHECKED,
}

export type Authorizer = (
  userName: string,
  request: Request,
) => Promise<AuthorizationStatus>;

export type RequestCredentials =
  | undefined
  | (AccessToken & { authorizationStatus: AuthorizationStatus });

export const STRATEGY_TOPLEVEL_USER_HEADER = 'jwt-user-header';
export const STRATEGY_TOPLEVEL_USER_URL = 'jwt-user-url';
export const STRATEGY_ROUTELEVEL_ADMIN_HEADER = 'jwt-admin-header';
export const STRATEGY_ROUTELEVEL_USER_HEADER = 'jwt-route-user-header';
export const STRATEGY_ROUTELEVEL_USER_COOKIE = 'jwt-route-user-cookie';
export const STRATEGY_INTERNAL_REQUEST = 'internal-request';
export const STRATEGY_GIT = 'git-request';
