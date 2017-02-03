import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { charlesKnexInjectSymbol } from '../shared/types';
import { TeamToken, validateTeamToken } from './team-token';

const validTokens: TeamToken[] = [
  {
    token: 'abcd123',
    teamId: 1,
    createdAt: moment.utc(),
  },
  {
    token: 'abcd124',
    teamId: 1,
    createdAt: moment.utc().subtract(5, 'days'),
  },
  {
    token: 'abcd125',
    teamId: 2,
    createdAt: moment.utc(),
  },
  {
    token: 'abcd126',
    teamId: 2,
    createdAt: moment.utc().subtract(5, 'days'),
  },
];

async function getDb() {
  const db = get<Knex>(charlesKnexInjectSymbol);
  await db.migrate.latest({
    directory: 'migrations/authentication',
  });
  return db;
}

describe('validateTeamToken', () => {

  it('should return the latest token per team', async () => {
    const db = await getDb();
    const toDb = (token: TeamToken) => ({ ...token, createdAt: token.createdAt.valueOf() });
    await Promise.all(validTokens.map(item => db('teamtoken').insert(toDb(item))));
    let teamId = await validateTeamToken(validTokens[0].token, db);
    expect(teamId).to.eq(validTokens[0].teamId);
    teamId = await validateTeamToken(validTokens[2].token, db);
    expect(teamId).to.eq(validTokens[2].teamId);
  });
  it('should not accept nonexistent or invalidated tokens', async () => {
    const db = await getDb();
    const toDb = (token: TeamToken) => ({ ...token, createdAt: token.createdAt.valueOf() });
    await Promise.all(validTokens.map(item => db('teamtoken').insert(toDb(item))));

    const exceptions: Error[] = [];
    try {
      await validateTeamToken(validTokens[1].token, db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(1);
    try {
      await validateTeamToken(validTokens[3].token, db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(2);
    try {
      await validateTeamToken(validTokens[0].token.replace('1', '8'), db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(3);
  });
});
