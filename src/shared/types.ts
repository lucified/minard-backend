export type ENV = 'production' | 'development' | 'test' | 'staging';
export const fetchInjectSymbol = Symbol('fetch');
export const sentryDsnInjectSymbol = Symbol('sentry-dsn');
export const charlesKnexInjectSymbol = Symbol('charles-knex');
export const charlesDbNameInjectSymbol = Symbol('charles-db-name');
export const gitlabKnexInjectSymbol = Symbol('gitlab-knex');
export const postgresKnexInjectSymbol = Symbol('postgres-knex');
export const adminTeamNameInjectSymbol = Symbol('admin-team-name');
