
export { default as productionConfig } from './config-production';
export { default as developmentConfig } from './config-development';

let override = null;
try {
  override = require('./config-override').default;
} catch (err) {
  // there was no override config
}

export function getOverrideConfig() {
  return override;
}
