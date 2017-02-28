import { Container } from 'inversify';

import { jwtOptionsInjectSymbol } from '../authentication';
import { goodOptionsInjectSymbol } from '../server';
import productionConfig from './config-production';
import { getJwtOptions } from './config-test';
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
  if (process.env.INTEGRATION_TEST === '1') {
    console.log('** INTEGRATION TEST MODE **');
    kernel.rebind(jwtOptionsInjectSymbol).toConstantValue(getJwtOptions());
  }
};
