import { Container } from 'inversify';

import { default as common } from './config-common';
import { default as development } from './config-development';
import { default as override } from './config-override';
import { default as production } from './config-production';
import { default as test } from './config-test';

import { ENV } from '../shared/types';

interface Configs {
  [env: string]: ((kernel: Container) => void) | undefined;
}
const configs: Configs = {
  production,
  development,
  staging: production,
  test,
};

export function bootstrap(env?: ENV, silent = true) {
  // Load bindings that represent configuration
  const _env: ENV = env || process.env.NODE_ENV || 'development';
  const config = configs[_env];
  if (!config) {
    throw new Error(`Unknown environment '${_env}''`);
  }
  const kernel = new Container();
  kernel.load(common);
  config(kernel);
  override(kernel, _env);
  if (!silent) {
    console.log(`Loaded configuration for environment '${_env}'`);
  }
  return kernel;
}
