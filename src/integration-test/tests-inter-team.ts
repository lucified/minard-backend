/* tslint:disable:only-arrow-functions variable-name */
import { expect } from 'chai';
import routes, { codes } from './routes';
import { CharlesClients, TeamType } from './types';

const teamTypes: TeamType[] = [
  'anonymous',
  'regular',
  'admin',
  'open',
];

export default (
  clientsFactory: () => Promise<CharlesClients>,
  _projectName = 'regular-project',
) => {
  let clients: CharlesClients;
  before(async () => {
    clients = await clientsFactory();
  });
  for (const route of routes) {
    expect(route.accessMatrix.length).to.eq(teamTypes.length);
    expect(route.accessMatrix.map(x => x.length).reduce((sum, c) => sum + c, 0))
      .to.eq(teamTypes.length ** 2);
    describe(route.description, () => {
      for (let i = 0; i < teamTypes.length; i++) {
        describe(`user belonging to the ${teamTypes[i]} team`, () => {
          for (let j = 0; j < teamTypes.length; j++) {
            const belongsTo = i === j ? 'itself' : `to the ${teamTypes[j]} team`;
            const entity = j === 0 ? 'which doesn\'t exist' : `belonging to ${belongsTo}`;
            describe(`requests an entity ${entity}`, () => {
              const access = route.accessMatrix[i][j];
              const expectedCode = codes[access];
              it(`the response code should be ${expectedCode}`, async function () {
                this.timeout(10000);
                const requestor = clients[teamTypes[i]];
                const owner = clients[teamTypes[j]];
                const response = await route.request(requestor, owner);
                expect(response.status).to.eq(expectedCode);
              });
            });
          }
        });
      }
    });
  }
};
