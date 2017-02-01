import { Container, interfaces } from 'inversify';

import { default as common } from './config-common';
import { default as development } from './config-development';
import { default as override } from './config-override';
import { default as production } from './config-production';
import { default as test } from './config-test';

import { ENV } from '../shared/types';

const kernel = new Container();
kernel.load(common);

interface Configs {
  [env: string]: ((kernel: Container) => void) | undefined;
}
const configs: Configs = {
  production,
  development,
  staging: production,
  test,
};

// Load bindings that represent configuration
const env: ENV = process.env.NODE_ENV || 'development';
const config = configs[env];
if (!config) {
  throw new Error(`Unknown environment '${env}''`);
}
config(kernel);
override(kernel, env);

export function get<T>(identifier: symbol | string | interfaces.Newable<T> | interfaces.Abstract<T>) {
  return kernel.get<T>(identifier);
}
