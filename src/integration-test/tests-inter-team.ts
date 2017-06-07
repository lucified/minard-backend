import { expect } from 'chai';
import routes, { codes } from './routes';
import { CharlesClients, EntityType, UserType } from './types';

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
