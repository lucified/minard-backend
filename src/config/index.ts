import { Kernel, interfaces } from 'inversify';

import { default as common } from './config-common';
import { default as development } from './config-development';
import { default as override } from './config-override';
import { default as production } from './config-production';

import { ENV } from '../shared/types';

const kernel = new Kernel();
kernel.load(common);

interface Configs {
  [env: string]: ((kernel: interfaces.Kernel) => void) | undefined;
}
const configs: Configs = {
  production,
  development,
  'staging': production,
  'test': development,
};

// Load bindings that represent configuration
const env: ENV = process.env.NODE_ENV || 'development';
const config = configs[env];
if (!config) {
  throw new Error(`Unknown environment '${env}''`);
}
config(kernel);
override(kernel, env);

export function get<T>(identifier: Symbol | string) { return kernel.get<T>(identifier); }
