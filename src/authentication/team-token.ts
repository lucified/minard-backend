import * as Knex from 'knex';
import * as moment from 'moment';

const randomstring = require('randomstring');

export const teamTokenLength = 7;

export interface TeamToken {
  teamId: number;
  token: string;
  createdAt: number | moment.Moment;
}

/**
 * Creates an sql query for fetching team tokens.
 * The results can be filtered by specifying a token,
 * a teamId or both.
 */
export function teamTokenQuery(db: Knex, token?: string, teamId?: number) {
  const latestTokens = db('teamtoken')
    .select('teamId')
    .max('createdAt AS latestStamp')
    .groupBy('teamId')
    .as('latest');
  const query = db('teamtoken')
    .join(latestTokens, ((join: any) => join
      .on('teamtoken.teamId', '=', 'latest.teamId')
      .andOn('teamtoken.createdAt', '=', 'latest.latestStamp')) as any,
    );
  if (token) {
    if (token.length !== teamTokenLength || !token.match(/^\w+$/)) {
      throw new Error('Invalid team token');
    }
    query.where('teamtoken.token', token);
  }
  if (teamId) {
    if (!teamId.toString().match(/^\d+$/)) {
      throw new Error('Invalid teamId');
    }
    if (token) {
      query.andWhere('teamtoken.teamId', teamId);
    } else {
      query.where('teamtoken.teamId', teamId);
    }
  }
  return query;
}

export async function getTeamIdWithToken(token: string, db: Knex) {
  const teamTokens: TeamToken[] = await teamTokenQuery(db, token);
  if (!teamTokens || teamTokens.length !== 1) {
    throw new Error('Invalid team token');
  }
  return teamTokens[0].teamId;
}

export async function generateTeamToken(teamId: number, db: Knex): Promise<TeamToken> {
  const tokenString: string = randomstring.generate({
    length: teamTokenLength,
    charset: 'alphanumeric',
    readable: true,
  });
  const token = {
    teamId,
    token: tokenString,
    createdAt: moment.utc().valueOf(),
  };
  await db('teamtoken').insert(token);
  return token;
}
