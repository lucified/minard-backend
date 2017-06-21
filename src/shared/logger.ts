import { Logger, LoggerInstance, LoggerOptions, transports } from 'winston';

export const loggerInjectSymbol = Symbol('logger');
export type Logger = LoggerInstance;

export default (options?: LoggerOptions, silent?: boolean, debug?: boolean) =>
  new Logger(
    options || {
      transports: [
        new transports.Console({
          level: debug ? 'debug' : 'info',
          colorize: true,
          timestamp: true,
          prettyPrint: true,
          silent: silent ? true : false,
        }),
      ],
    },
  );
