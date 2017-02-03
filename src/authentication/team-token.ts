import * as Knex from 'knex';
import * as moment from 'moment';

export interface TeamToken {
  teamId: number;
  token: string;
  createdAt: number | moment.Moment;
}
export function teamTokenQuery(token: string, db: Knex) {
  if (!token || token.length !== 7 || !token.match(/^\w+$/)) {
    throw new Error('Invalid team token');
  }
  const latestTokens = db('teamtoken')
    .select(db.raw('teamId, MAX(createdAt) as latestStamp'))
    .groupBy('teamId')
    .as('latest');
  return db('teamtoken')
    .join(latestTokens, ((join: any) => join
      .on('teamtoken.teamId', '=', 'latest.teamId')
      .andOn('teamtoken.createdAt', '=', 'latest.latestStamp')) as any,
    )
    .where('teamtoken.token', token);
}

export async function validateTeamToken(token: string, db: Knex) {
  const teamTokens: TeamToken[] = await teamTokenQuery(token, db);
  if (!teamTokens || teamTokens.length !== 1) {
    throw new Error('Invalid team token');
  }
  return teamTokens[0].teamId;
}
