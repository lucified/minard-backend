import { NodeCallback } from 'util-promisify';

interface JWKSOptions {
  cache?: boolean;
  rateLimit?: boolean;
  jwksRequestsPerMinute?: number;
  jwksUri: string;
}
interface JWTStrategyKeyLookup {
  (decoded: any, callback: (
    err: any,
    key: string | string[],
    extraInfo: any,
  ) => void): void;
}

declare function MyFunction(options: JWKSOptions): MyFunction.JwksClient

declare namespace MyFunction {
  export interface JwksClient {
    getSigningKey: (kid: string, cb: NodeCallback<Key>) => void;
  }
  export interface Key {
    publicKey?: string;
    rsaPublicKey?: string;
  }
  export const hapiJwt2Key: (options: JWKSOptions) => JWTStrategyKeyLookup;
}

export = MyFunction;
