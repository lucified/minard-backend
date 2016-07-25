
import 'reflect-metadata';

import UserModule from './user-module';
import { expect } from 'chai';

import * as Knex from 'knex';

// TODO: use mocked db for this unit test

describe('user-module', () => {
  it('getGitlabPrivateToken', async (done) => {
    try {
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
      const um = new UserModule(knex);
      const token = await um.getPrivateAuthenticationToken(1);
      expect(token).to.equal('GG3TDoKuXXJVFw8nmQ7G');
      done();
    } catch (err) {
      done(err);
    }
  });
});
