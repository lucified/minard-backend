import { Container } from 'inversify';

import { ENV } from '../shared/types';

let override: ((kernel: Container, env: ENV) => void) | null = null;
try {
  override = require('./config-local-override').default;
} catch (err) {
  // there was no local override config
}

export default (kernel: Container, env: ENV) => {
  if (override) {
    override(kernel, env);
  }
};
