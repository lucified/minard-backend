import { expect } from 'chai';
import 'reflect-metadata';
import { GitAuthScheme } from '../authentication/git-auth-scheme';
import { getConfiguration } from './utils';

const { MINARD_USERNAME, MINARD_PASSWORD, NODE_ENV } = process.env;
const configPromise = getConfiguration(NODE_ENV);
const hasUserCredentials = MINARD_USERNAME && MINARD_PASSWORD;
/*
 * While theses test only test one class, they are integration tests,
 * because they are run against the actual Auth0 backend
 */
describe('git-authentication', () => {
  let scheme: GitAuthScheme;
  let accessToken: string;
  let signingKey: string;
  const credentialsList: {
    description: string;
    idPromise?: Promise<string>;
    secretPromise?: Promise<string>;
  }[] = [
    {
      description: 'user',
      idPromise: hasUserCredentials
        ? Promise.resolve(process.env.MINARD_USERNAME)
        : undefined,
      secretPromise: hasUserCredentials
        ? Promise.resolve(process.env.MINARD_PASSWORD)
        : undefined,
    },
    {
      description: 'client',
      idPromise: configPromise.then(
        c => c.auth0.regular.nonInteractiveClientId,
      ),
      secretPromise: configPromise.then(
        c => c.auth0.regular.nonInteractiveClientSecret,
      ),
    },
  ];

  beforeEach(async () => {
    const config = await configPromise;
    const { uiClientId, domain, audience } = config.auth0.regular;
    scheme = new GitAuthScheme(uiClientId, domain, audience, _ => 'foo');
  });

  describe('parseBasicAuth', () => {
    it('should be able to parse username and password', () => {
      // Arrange
      const correctUsername = 'foo';
      const correctPassword = 'bar';
      const buffer = new Buffer(`${correctUsername}:${correctPassword}`);
      const authorization = `Basic ${buffer.toString('base64')}`;

      // Act
      const { username, password } = scheme.parseBasicAuth(authorization);

      // Assert
      expect(username).to.eq(correctUsername);
      expect(password).to.eq(correctPassword);
    });
    it('should be able to parse username if password is empty', () => {
      // Arrange
      const correctUsername = 'foo';
      const correctPassword = '';
      const buffer = new Buffer(`${correctUsername}:${correctPassword}`);
      const authorization = `Basic ${buffer.toString('base64')}`;

      // Act
      const { username, password } = scheme.parseBasicAuth(authorization);

      // Assert
      expect(username).to.eq(correctUsername);
      expect(password).to.eq(correctPassword);

    });
    it('should throw if separator is not found', () => {
      // Arrange
      const correctUsername = 'foo';
      const correctPassword = '';
      const buffer = new Buffer(`${correctUsername}${correctPassword}`);
      const authorization = `Basic ${buffer.toString('base64')}`;

      // Act
      const tryParse = () => scheme.parseBasicAuth(authorization);

      // Assert
      expect(tryParse).to.throw;
    });
  });

  for (const { idPromise, secretPromise, description } of credentialsList) {
    (idPromise && secretPromise ? describe : describe.skip)(description, () => {
      // tslint:disable-next-line:only-arrow-functions
      it('should be able to get the accessToken with correct credentials', async function () {
        // Arrange
        this.timeout(5000);
        const id = await idPromise!;
        const secret = await secretPromise!;
        // Act
        accessToken = await scheme.login(id, secret);

        // Assert
        expect(accessToken).to.exist;
        const parts = accessToken.split('.');
        expect(parts.length).to.eq(3);
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
        expect(response.gitlabPassword).to.exist;
        expect(response.aud).to.include(scheme.auth0Audience);
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
        // Arrange
        const id = await idPromise!;
        const secret = await secretPromise!;

        // Act
        try {
          await scheme.login(id, secret + 'x');
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
