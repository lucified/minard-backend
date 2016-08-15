export { JsonApiModule } from './json-api-module';
export { MemoizedJsonApiModule, memoizeApi } from './memoized-json-api-module';
export { JsonApiHapiPlugin } from './json-api-hapi-plugin';
export * from './types';

export const jsonApiInjectSymbol = Symbol('json-api-module');
export const factoryInjectSymbol = Symbol('json-api-module-factory');
