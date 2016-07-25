
import * as Knex from 'knex';

// TODO: inject this
const knex = Knex({
  client: 'postgresql',
  connection: {
    host     : 'localhost',
    user     : 'gitlab',
    password : 'password',
    database : 'gitlabhq_production',
    port: '5432',
  },
});

export async function getPrivateAuthenticationToken(userId: number): Promise<string> {
  const row = await knex.select('authentication_token')
    .from('users').where('id', userId).first();
  return row.authentication_token;
}
