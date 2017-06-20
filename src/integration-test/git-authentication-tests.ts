import { expect } from 'chai';
import 'reflect-metadata';
import { GitAuthScheme } from '../authentication/git-auth-scheme';
import { getConfiguration } from './utils';

/*
 * While theses test only test one class, they are integration tests,
 * because they are run against the actual Auth0 backend
 */

describe('git-authentication', () => {
  let scheme: GitAuthScheme;
  let accessToken: string;
  let signingKey: string;
  let domain: string;
  let audience: string;
  let credentialsList: {
    description: string;
    id: string;
    secret: string;
  }[] = [];

  before(async () => {
    const config = await getConfiguration(process.env.NODE_ENV);
    const { clientId, clientSecret } = config.auth0.regular;
    domain = config.auth0.regular.domain;
    audience = config.auth0.regular.audience;
    credentialsList = [
      {
        description: 'user',
        id: process.env.USERNAME,
        secret: process.env.PASSWORD,
      },
      {
        description: 'client',
        id: clientId,
        secret: clientSecret,
      },
    ];
  });

  beforeEach(() => {
    scheme = new GitAuthScheme(
      'ZaeiNyV7S7MpI69cKNHr8wXe5Bdr8tvW',
      domain,
      audience,
      _ => '12345678',
    );
  });

  for (const { id, secret, description } of credentialsList) {
    (id && secret ? describe : describe.skip)(description, () => {
      const invalidSecret = secret + '9';

      it('should be able to get the accessToken with correct credentials', async () => {
        // Act
        const response = await scheme.login(id, secret);

        // Assert
        expect(response.accessToken).to.exist;
        const parts = response.accessToken.split('.');
        expect(parts.length).to.eq(3);
        accessToken = response.accessToken;
      });

      it('should be able to get the signing key', async () => {
        // Act
        const response = await scheme.getSigningKey(scheme.decode(accessToken));

        // Assert
        expect(response).to.exist;
        expect(typeof response).to.eq('string');
        signingKey = response;
      });

      it('should verify correct accessToken', () => {
        // Act
        const response = scheme.verify(accessToken, signingKey);

        // Assert
        expect(response.sub).to.exist;
        expect(response.username).to.exist;
        expect(response.aud).to.include(audience);
      });

      it('should throw an error with invalid accessToken', () => {
        // Act
        try {
          scheme.verify(accessToken + 'x', signingKey);
          expect.fail();
        } catch (error) {
          // Assert
          expect(error).to.exist;
        }
      });

      it('should throw an error with invalid signingKey', () => {
        // Act
        try {
          scheme.verify(accessToken, signingKey + 'x');
          expect.fail();
        } catch (error) {
          // Assert
          expect(error).to.exist;
        }
      });

      it('should throw an error with incorrect credentials', async () => {
        // Act
        try {
          await scheme.login(id, invalidSecret);
          expect.fail();
        } catch (error) {
          // Assert
          expect(error).to.exist;
          expect([401, 403]).to.include(
            error.output ? error.output.statusCode : error.statusCode,
          );
        }
      });
    });
  }
});
