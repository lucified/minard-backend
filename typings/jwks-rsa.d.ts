
interface JWKSOptions {
  cache?: boolean;
  rateLimit?: boolean;
  jwksRequestsPerMinute?: number;
  jwksUri: string;
}
interface JWTStrategyKeyLookup {
  (decoded: any, callback: (err: any, key: string | string[], extraInfo: any) => void): void;
}

export const hapiJwt2Key: (options: JWKSOptions) => JWTStrategyKeyLookup;

