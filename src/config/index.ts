import { Container } from 'inversify';

import { ENV } from '../shared/types';
import { default as common } from './config-common';
import { default as override } from './config-override';

export function bootstrap(env?: ENV, silent = true) {
  // Load bindings that represent configuration
  const _env: ENV = env || process.env.NODE_ENV || 'development';
  let config: ((kernel: Container) => void);
  switch (_env) {
    case 'production':
    case 'staging':
      config = require('./config-production').default;
      break;
    case 'development':
      config = require('./config-development').default;
      break;
    case 'test':
      config = require('./config-test').default;
      break;
    default:
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
