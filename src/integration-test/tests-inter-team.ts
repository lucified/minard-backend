import { expect } from 'chai';
import routes, { codes } from './routes';
import { CharlesClients, EntityType, UserType } from './types';
import { runCommand } from './utils';

export default (
  clientsFactory: () => Promise<CharlesClients>,
  _projectName = 'regular-project',
) => {
  let clients: CharlesClients;
  before(async () => {
    clients = await clientsFactory();
  });
  for (const route of routes) {
    describe(route.description, () => {
      const userTypes = Object.keys(route.accessMatrix) as UserType[];
      for (const userType of userTypes) {
        describe(`user of type ${userType}`, () => {
          const entityResponse = route.accessMatrix[userType];
          const entityTypes = Object.keys(entityResponse) as EntityType[];
          for (const entityType of entityTypes) {
            describe(`requests an entity of type ${entityType}`, () => {
              const expectedCode = codes[entityResponse[entityType]];
              it(`the response code should be ${expectedCode}`, async function() {
                this.timeout(10000);
                const requestor = clients[userType];
                const response = await route.request(
                  requestor,
                  getOwnerClient(userType, entityType, clients),
                );
                expect(response.status).to.eq(expectedCode);
              });
            });
          }
        });
      }
    });
  }
  const userTypes: (keyof CharlesClients)[] = ['regular', 'open'];
  for (const userType of userTypes) {
    describe(`${userType} user`, () => {
      // tslint:disable-next-line:only-arrow-functions
      it(`should not be able to clone another team\'s project`, async function() {
        const accessToken = clients[userType].accessToken;
        const repoFolder = `src/integration-test/blank-cloned`;
        await runCommand('rm', '-rf', repoFolder);
        const repoUrl = clients.admin.getRepoUrlWithCredentials({
          username: accessToken,
          password: '',
        });
        try {
          await runCommand('git', 'clone', repoUrl, repoFolder);
          expect.fail(undefined, undefined, 'message');
        } catch (error) {
          expect(error.message).to.not.eq('message');
          console.log(error);
        }
      });

      // tslint:disable-next-line:only-arrow-functions
      it(`should not be able to push to another team\'s project`, async function() {
        this.timeout(20000);
        const accessToken = clients[userType].accessToken;
        const repoFolder = `src/integration-test/blank-cloned`;
        await runCommand('rm', '-rf', repoFolder);
        await runCommand(
          'git',
          'clone',
          clients.admin.getRepoUrlWithCredentials(),
          repoFolder,
        );
        const repoUrl = clients.admin.getRepoUrlWithCredentials({
          username: accessToken,
          password: '',
        });
        await runCommand(
          'git',
          '-C',
          repoFolder,
          'remote',
          'add',
          'minard',
          repoUrl,
        );
        await runCommand('git', '-C', repoFolder, 'remote', 'rm', 'origin');
        await runCommand('touch', `${repoFolder}/newFile${Date.now()}`);
        await runCommand('git', '-C', repoFolder, 'add', '-A');
        await runCommand('git', '-C', repoFolder, 'commit', '-m', 'message');
        try {
          await runCommand('git', '-C', repoFolder, 'push', 'minard', 'master');
          expect.fail(undefined, undefined, 'message');
        } catch (error) {
          expect(error.message).to.not.eq('message');
          console.log(error);
        }
      });
    });
  }
  describe('admin user', () => {
    for (const userType of userTypes) {
      // tslint:disable-next-line:only-arrow-functions
      it(`should be able to clone ${userType} user's project`, async function() {
        this.timeout(20000);
        const accessToken = clients.admin.accessToken;
        const repoFolder = `src/integration-test/blank-cloned-admin`;
        await runCommand('rm', '-rf', repoFolder);
        await runCommand(
          'git',
          'clone',
          clients[userType].getRepoUrlWithCredentials({
            username: accessToken,
            password: '',
          }),
          repoFolder,
        );
      });
      // tslint:disable-next-line:only-arrow-functions
      it(`should be able to push to ${userType} user's project`, async function() {
        this.timeout(20000);
        const repoFolder = `src/integration-test/blank-cloned-admin`;
        await runCommand('touch', `${repoFolder}/newFile${Date.now()}`);
        await runCommand('git', '-C', repoFolder, 'add', '-A');
        await runCommand('git', '-C', repoFolder, 'commit', '-m', 'message');
        await runCommand('git', '-C', repoFolder, 'push', 'origin', 'master');
      });
    }
  });
};

function getOwnerClient(
  userType: UserType,
  entityType: EntityType,
  clients: CharlesClients,
) {
  switch (entityType) {
    case 'own':
      return clients[userType];
    case 'closed':
      return userType === 'admin' ? clients.regular : clients.admin;
    case 'open':
      return clients.open;
    case 'missing':
      return clients.unauthenticated;
  }
}
