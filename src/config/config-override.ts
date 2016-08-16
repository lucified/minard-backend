import { Kernel, interfaces } from 'inversify';

import { ENV } from '../shared/types';

let override: ((kernel: interfaces.Kernel, env: ENV) => void) | null = null;
try {
  override = require('./config-local-override').default;
} catch (err) {
  // there was no local override config
}

export default (kernel: interfaces.Kernel, env: ENV) => {
  if (override) {
    override(kernel, env);
  }
};
