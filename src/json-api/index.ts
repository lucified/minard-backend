export { JsonApiModule } from './json-api-module';
export { MemoizedJsonApiModule, memoizeApi } from './memoized-json-api-module';
export { JsonApiHapiPlugin } from './json-api-hapi-plugin';
export * from './types';

export const jsonApiInjectSymbol = Symbol('json-api-module');
export const factoryInjectSymbol = Symbol('json-api-module-factory');

export function toApiCommitId(projectId: number, sha: string) {
  return `${projectId}-${sha}`;
}

export function toApiBranchId(projectId: number, branchName: string) {
  return `${projectId}-${branchName}`;
}
