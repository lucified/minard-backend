type JWTStrategyAlgorithms = 'RS256' | 'HS256';

interface JWTStrategyKeyLookup {
  (decoded: any, callback: (
    err: any,
    key: string | string[],
    extraInfo: any,
  ) => void): void;
}

interface JWTStrategyValidate {
  (decoded: any, request: any, callback: (
    err: any,
    valid: boolean,
    credentials?: any,
  ) => void): void;
}

export interface JWTStrategyOptions {
  key?: string | string[] | JWTStrategyKeyLookup;
  validateFunc?: JWTStrategyValidate;
  verifyFunc?: JWTStrategyValidate;
  verifyOptions?: {
    ignoreExpiration?: boolean;
    audience?: string;
    issuer?: string;
    algorithms: JWTStrategyAlgorithms[];
  };
  responseFunc?: (response: any) => void;
  errorFunc?: (errorContext: any) => any;
  urlkey?: string | false;
  cookieKey?: string | false;
  headerKey?: string | false;
  tokenType?: string;
  complete?: boolean;
}

export const register: (server: any, options: any, next: () => void) => void;
