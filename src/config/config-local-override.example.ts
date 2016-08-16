
import { Kernel, interfaces } from 'inversify';
import * as winston from 'winston';

import { goodOptionsInjectSymbol } from '../server';
import Logger, { loggerInjectSymbol } from '../shared/logger';
import { ENV } from '../shared/types';
import { FilterStream } from './utils';

function requestFilter(data: any) {
  // ignore successfull requests
  if (data.statusCode === 200) {
    return false;
  }
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

const winstonOptions = {
  transports: [
    new winston.transports.Console({
      level: 'error',
      colorize: true,
      timestamp: true,
      prettyPrint: true,
      silent: false,
    }),
  ],
};

export default (kernel: interfaces.Kernel, env: ENV) => {
  kernel.unbind(goodOptionsInjectSymbol);
  kernel.bind(goodOptionsInjectSymbol).toConstantValue(goodOptions);
  kernel.unbind(loggerInjectSymbol);
  kernel.bind(loggerInjectSymbol).toConstantValue(Logger(winstonOptions));
};
