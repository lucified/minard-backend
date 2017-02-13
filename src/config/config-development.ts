import * as auth from 'hapi-auth-jwt2';
import { Container } from 'inversify';
import { sign } from 'jsonwebtoken';

import { AccessToken, jwtOptionsInjectSymbol, teamTokenClaimKey } from '../authentication';
import { goodOptionsInjectSymbol } from '../server';
import productionConfig from './config-production';
import { FilterStream } from './utils';

function requestFilter(data: any) {
  if (data.path
      && data.path.indexOf('/ci/api/v1/builds/register.json') !== -1
      && data.statusCode === 404) {
    return false;
  }
  return true;
};

const goodOptions = {
  reporters: {
    console: [
      new FilterStream(requestFilter),
      {
        module: 'good-squeeze',
        name: 'Squeeze',
        args: [
          {
            log: '*',
            response: '*',
            error: '*',
          },
        ],
      },
      {
        module: 'good-console',
      },
      'stdout',
    ],
  },
};
// Access token parameters
export const audience = 'https://api.foo.com';
export const issuer = 'https://issuer.foo.com';
export const secretKey = 'shhhhhhh';
export const algorithm = 'HS256';

function getJwtOptions(): auth.JWTStrategyOptions {
  return {
    // Get the complete decoded token, because we need info from the header (the kid)
    complete: true,
    key: secretKey,
    // Validate the audience, issuer, algorithm and expiration.
    verifyOptions: {
      audience,
      issuer,
      algorithms: [algorithm],
      ignoreExpiration: false,
    },
  };
}

export function getAccessToken(sub: string, teamToken?: string, email?: string) {
  let payload: Partial<AccessToken> = {
    iss: issuer,
    sub,
    aud: [audience],
    azp: 'azp',
    scope: 'openid profile email',
  };
  if (teamToken) {
    payload = { ...payload, [teamTokenClaimKey]: teamToken };
  }
  if (email) {
    payload = { ...payload, email };
  }
  return sign(payload, secretKey);
}

export default (kernel: Container) => {
  productionConfig(kernel);
  kernel.rebind(goodOptionsInjectSymbol).toConstantValue(goodOptions);
  kernel.rebind(jwtOptionsInjectSymbol).toConstantValue(getJwtOptions());
};
