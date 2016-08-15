const memoize = require('memoizee');
import { inject, injectable } from 'inversify';

import {
  ActivityModule,
} from '../activity';

import {
  DeploymentModule,
} from '../deployment/';

import {
  ProjectModule,
} from '../project/';

import { JsonApiModule } from './';

const memoizedMethods = [{
  name: 'getProject',
  normalizer: (args: any) => args[0],
}, {
  name: 'getBranch',
  normalizer: (args: any) => `${(args[0])}-${(args[1])}`,
}, {
  name: 'toApiProject',
  normalizer: (args: any) => args[0].id,
}, {
  name: 'toApiBranch',
  normalizer: (args: any) => `${args[0].id}-${args[1].name}`,
}, {
  name: 'toApiDeployment',
  normalizer: (args: any) => `${args[0]}-${args[1].id}`,
}, {
  name: 'toApiCommit',
  normalizer: (args: any) => `${args[0]}-${args[1].id}`,
}];

export function memoizeApi(api: JsonApiModule) {
  memoizedMethods.map(method => {
    const _api = <any> api;
    const originalMethod = _api[method.name].bind(api);
    const memoized = memoize(originalMethod, {
      promise: true,
      normalizer: method.normalizer,
    });
    _api[method.name] = memoized;
    return memoized;
  });
  return api;
}

function mapApiMethods(api: JsonApiModule, to: any) {
  // Map all methods from

  Object.getOwnPropertyNames(JsonApiModule.prototype)
    .map(p => {
      return p;
    })
    .filter(prop => typeof (<any> api)[prop] === 'function' && prop !== 'constructor')
    .forEach(method => {
      to[method] = (<any> api)[method].bind(api);
    });
}

@injectable()
export class MemoizedJsonApiModule extends JsonApiModule {

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule) {
    super(deploymentModule, projectModule, activityModule);
    memoizeApi(this);
    mapApiMethods(this, this);
  }

  public invalidate() {
    memoizedMethods.forEach(method => (<any> this)[method.name].clear());
  }
}
