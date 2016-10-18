export type ENV = 'production' | 'development' | 'test' | 'staging';
export const fetchInjectSymbol = Symbol('fetch');
export const sentryDsnInjectSymbol = Symbol('sentry-dsn');
