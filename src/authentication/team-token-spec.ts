import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { charlesKnexInjectSymbol } from '../shared/types';
import { generateTeamToken, TeamToken, teamTokenLength, getTeamIdWithToken } from './team-token';

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

export async function getDb() {
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
    let teamId = await getTeamIdWithToken(validTokens[0].token, db);
    expect(teamId).to.eq(validTokens[0].teamId);
    teamId = await getTeamIdWithToken(validTokens[2].token, db);
    expect(teamId).to.eq(validTokens[2].teamId);
  });
  it('should not accept nonexistent or invalidated tokens', async () => {
    const db = await getDb();
    const toDb = (token: TeamToken) => ({ ...token, createdAt: token.createdAt.valueOf() });
    await Promise.all(validTokens.map(item => db('teamtoken').insert(toDb(item))));

    const exceptions: Error[] = [];
    try {
      await getTeamIdWithToken(validTokens[1].token, db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(1);
    try {
      await getTeamIdWithToken(validTokens[3].token, db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(2);
    try {
      await getTeamIdWithToken(validTokens[0].token.replace('1', '8'), db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(3);
  });
});

describe('generateTeamToken', () => {

  it('should return a token of specified length', async () => {
    const db = await getDb();
    const token = await generateTeamToken(342, db);
    expect(token.token.length).to.eq(teamTokenLength);
  });

  it('should invalidate the previous token for the same team', async () => {
    // Arrange
    const db = await getDb();
    const teamId1 = 395;
    const teamId2 = teamId1 + 1;

    // Act
    const token1 = await generateTeamToken(teamId1, db);
    const check1 = await getTeamIdWithToken(token1.token, db);
    const token2 = await generateTeamToken(teamId1, db);
    const check2 = await getTeamIdWithToken(token2.token, db);

    let check3 = true;
    try {
      await getTeamIdWithToken(token1.token, db);
    } catch (error) {
      check3 = false;
    }

    const token3 = await generateTeamToken(teamId2, db);
    const check4 = await getTeamIdWithToken(token3.token, db);
    const check5 = await getTeamIdWithToken(token2.token, db);

    // Assert
    expect(check1).to.eq(teamId1);
    expect(check2).to.eq(teamId1);
    expect(check3).to.be.false;
    expect(check4).to.eq(teamId2);
    expect(check5).to.eq(teamId1);

  });

});
