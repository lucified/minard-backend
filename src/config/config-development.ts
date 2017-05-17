import { Container } from 'inversify';
import productionConfig from './config-production';

export default (kernel: Container) => {
  productionConfig(kernel);
};
