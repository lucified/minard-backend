import { expect } from 'chai';
import * as Knex from 'knex';
import 'reflect-metadata';

import AuthenticationModule from './authentication-module';

describe('authentication-module', () => {
  it('getGitlabPrivateToken', async () => {
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    } as Knex.Config);
    await knex.schema.createTable('users', (table) => {
      table.string('authentication_token');
      table.integer('id');
    });
    await knex.table('users').insert({
      id: 1,
      authentication_token: 'GG3TDoKuXXJVFw8nmQ7G',
    });
    const authenticationModule = new AuthenticationModule(knex, '');
    const token = await authenticationModule.getPrivateAuthenticationToken(1);
    expect(token).to.equal('GG3TDoKuXXJVFw8nmQ7G');
  });
});
