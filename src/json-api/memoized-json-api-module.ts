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

@injectable()
export class MemoizedJsonApiModule extends JsonApiModule {

  public static injectSymbol = Symbol('memoized-json-api-module');

  private inner: JsonApiModule;
  private memoized: any[];

  constructor(
    @inject(JsonApiModule.injectSymbol) inner: JsonApiModule,
    @inject(DeploymentModule.injectSymbol) deploymentModule?: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule?: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule?: ActivityModule) {
    super();
    this.inner = inner;
    this.memoize();
  }

  private memoize() {
    const api = this.inner;

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

    // Memoize everything we want memoized
    this.memoized = memoizedMethods.map(method => {
      const originalMethod = (<any> api)[method.name].bind(api);
      const memoized = memoize(originalMethod, {
        promise: true,
        normalizer: method.normalizer,
      });
      (<any> api)[method.name] = memoized;
      return memoized;
    }, this);

    // Map all of our own methods to this.api
    Object.getOwnPropertyNames(JsonApiModule.prototype)
      .map(p => {
        return p;
      })
      .filter(prop => typeof (<any> api)[prop] === 'function' && prop !== 'constructor')
      .forEach(method => {
        (<any> this)[method] = (<any> api)[method].bind(api);
      });

  }

  public invalidate() {
    this.memoized.forEach(method => method.clear());
  }
}
