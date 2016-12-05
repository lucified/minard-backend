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

import {
  NotificationModule,
} from '../notification';

import {
  CommentModule,
} from '../comment';

import { ScreenshotModule } from '../screenshot';

import { JsonApiModule } from './json-api-module';

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
  normalizer: (args: any) => `${args[0]}-${args[1].id}`,
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
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(NotificationModule.injectSymbol) notificationModule: NotificationModule,
    @inject(CommentModule.injectSymbol) commentModule: CommentModule) {
    super(deploymentModule, projectModule, activityModule, screenshotModule, notificationModule, commentModule);
    memoizeApi(this);
  }

  // Not used anywere so far
  public invalidate() {
    memoizedMethods.forEach(method => (<any> this)[method.name].clear());
  }
}
