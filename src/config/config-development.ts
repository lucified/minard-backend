import { Container } from 'inversify';
import { goodOptionsInjectSymbol } from '../server';
import productionConfig from './config-production';
import { FilterStream } from './utils';

function requestFilter(data: any) {
  if (data.path
      && data.path.indexOf('/ci/api/v1/builds/register.json') !== -1
      && data.statusCode === 404) {
    return false;
  }
  return true;
};

const goodOptions = {
  reporters: {
    console: [
      new FilterStream(requestFilter),
      {
        module: 'good-squeeze',
        name: 'Squeeze',
        args: [
          {
            log: '*',
            response: '*',
            error: '*',
          },
        ],
      },
      {
        module: 'good-console',
      },
      'stdout',
    ],
  },
};

export default (kernel: Container) => {
  productionConfig(kernel);
  kernel.rebind(goodOptionsInjectSymbol).toConstantValue(goodOptions);
};
