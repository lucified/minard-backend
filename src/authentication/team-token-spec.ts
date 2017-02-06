import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { get } from '../config';
import { charlesKnexInjectSymbol } from '../shared/types';
import { generateTeamToken, TeamToken, teamTokenLength, validateTeamToken } from './team-token';

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

describe('generateTeamToken', () => {

  it('should return a token of specified length', async () => {
    const db = await getDb();
    const token = await generateTeamToken(342, db);
    expect(token.length).to.eq(teamTokenLength);
  });

  it('should invalidate the previous token for the same team', async () => {
    // Arrange
    const db = await getDb();
    const teamId1 = 395;
    const teamId2 = teamId1 + 1;

    // Act
    const token1 = await generateTeamToken(teamId1, db);
    const valid1 = await validateTeamToken(token1, db);
    const token2 = await generateTeamToken(teamId1, db);
    const valid2 = await validateTeamToken(token2, db);

    let valid3 = true;
    try {
      await validateTeamToken(token1, db);
    } catch (error) {
      valid3 = false;
    }

    const token3 = await generateTeamToken(teamId2, db);
    const valid4 = await validateTeamToken(token3, db);
    const valid5 = await validateTeamToken(token2, db);

    // Assert
    expect(valid1).to.eq(teamId1);
    expect(valid2).to.eq(teamId1);
    expect(valid3).to.be.false;
    expect(valid4).to.eq(teamId2);
    expect(valid5).to.eq(teamId1);

  });

});
