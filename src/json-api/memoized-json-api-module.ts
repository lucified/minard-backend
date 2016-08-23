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

import { ScreenshotModule } from '../screenshot';

import { JsonApiModule } from './json-api-module';

function id(arg: any) {
  if (!arg || !arg.id) {
    return '';
  }
  return arg.id;
}

function arrayIds(arr: any[]) {
  if (!arr) {
    return '';
  }
  return arr.map(item => item.id).join('-');
}

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
  normalizer: (args: any) => `${args[0]}-${args[1].id}-${id(args[2])}`,
}, {
  name: 'toApiCommit',
  normalizer: (args: any) => `${args[0]}-${args[1].id}-${arrayIds(args[2])}`,
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

@injectable()
export class MemoizedJsonApiModule extends JsonApiModule {

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule) {
    super(deploymentModule, projectModule, activityModule, screenshotModule);
    memoizeApi(this);
  }

  // Not used anywere so far
  public invalidate() {
    memoizedMethods.forEach(method => (<any> this)[method.name].clear());
  }
}
