import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { bootstrap } from '../config';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  generateAndSaveTeamToken,
  generateTeamToken,
  getTeamIdWithToken,
  TeamToken,
  teamTokenLength,
} from './team-token';

const kernel = bootstrap('test');
const knex = kernel.get<Knex>(charlesKnexInjectSymbol);

const validTokens: TeamToken[] = [
  {
    token: generateTeamToken(),
    teamId: 1,
    createdAt: moment.utc(),
  },
  {
    token: generateTeamToken(),
    teamId: 1,
    createdAt: moment.utc().subtract(5, 'days'),
  },
  {
    token: generateTeamToken(),
    teamId: 2,
    createdAt: moment.utc(),
  },
  {
    token: generateTeamToken(),
    teamId: 2,
    createdAt: moment.utc().subtract(5, 'days'),
  },
];

export async function initializeTeamTokenTable(db: Knex) {
  await db.schema.dropTableIfExists('teamtoken');
  await db.schema.createTable('teamtoken', table => {
    table.increments('id').primary();
    table.integer('teamId').index();
    table.string('token').index();
    table.bigInteger('createdAt').index();
  });
  return db;
}

export async function insertTeamToken(db: Knex, token: TeamToken) {
  const toDb = (t: TeamToken) => ({ ...t, createdAt: t.createdAt.valueOf() });
  return db('teamtoken').insert(toDb(token));
}

describe('getTeamIdWithToken', () => {
  it('should return the latest token per team', async () => {
    const db = await initializeTeamTokenTable(knex);
    await Promise.all(validTokens.map(insertTeamToken.bind(undefined, db)));
    let teamId = await getTeamIdWithToken(validTokens[0].token, db);
    expect(teamId).to.eq(validTokens[0].teamId);
    teamId = await getTeamIdWithToken(validTokens[2].token, db);
    expect(teamId).to.eq(validTokens[2].teamId);
  });
  it('should not accept nonexistent or invalidated tokens', async () => {
    const db = await initializeTeamTokenTable(knex);
    await Promise.all(validTokens.map(insertTeamToken.bind(undefined, db)));

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
      await getTeamIdWithToken(generateTeamToken(), db);
    } catch (err) {
      exceptions.push(err);
    }
    expect(exceptions.length).to.eq(3);
  });
});

describe('generateTeamToken', () => {
  it('should return a token of specified length', async () => {
    const token = generateTeamToken();
    expect(token.length).to.eq(teamTokenLength);
  });
});

describe('generateAndSaveTeamToken', () => {
  it('should invalidate the previous token for the same team', async () => {
    // Arrange
    const db = await initializeTeamTokenTable(knex);
    const teamId1 = 395;
    const teamId2 = teamId1 + 1;

    // Act
    const token1 = await generateAndSaveTeamToken(teamId1, db);
    const check1 = await getTeamIdWithToken(token1.token, db);
    const token2 = await generateAndSaveTeamToken(teamId1, db);
    const check2 = await getTeamIdWithToken(token2.token, db);

    let check3 = true;
    try {
      await getTeamIdWithToken(token1.token, db);
    } catch (error) {
      check3 = false;
    }

    const token3 = await generateAndSaveTeamToken(teamId2, db);
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
