import { inject, injectable } from 'inversify';

import { IFetch } from './fetch';
import { Logger, loggerInjectSymbol } from './logger';
import { sleep } from './sleep';
import { fetchInjectSymbol } from './types';

interface Route53UpdaterParams {
  hostedZoneId: string;
  recordSetName: string;
  type?: string;
  ttl?: number;
  metadata?: string;
}
export interface Route53UpdaterFunction {
  (action: string, params: Route53UpdaterParams, callback: (err?: any) => void): void;
}

const route53Updater: Route53UpdaterFunction = require('route53-updater');

// The IP below is the IP for the AWS metadata URL
const ec2IpUrl = 'http://169.254.169.254/latest/meta-data/local-ipv4';
@injectable()
export class Route53Updater {

  public static injectSymbol = Symbol('service-registrator');

  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';

  private logger: Logger;
  private fetch: IFetch;
  private retryDelay: number;
  private maxTimes: number;
  private route53Updater: Route53UpdaterFunction;

  public constructor(
    @inject(fetchInjectSymbol) fetch: IFetch,
    @inject(loggerInjectSymbol) logger: Logger,
    retryDelay = 200,
    maxTimes = 5,
    _route53Updater?: Route53UpdaterFunction) {
    this.logger = logger;
    this.fetch = fetch;
    this.retryDelay = retryDelay;
    this.maxTimes = maxTimes;
    // For unit testing
    this.route53Updater = _route53Updater || route53Updater;
  }

  public async update(baseUrl: string, hostedZoneId: string) {

    if (!baseUrl) {
      this.logger.info('[route53Update] Base url undefined, skipping update.');
      return false;
    }

    if (!hostedZoneId) {
      this.logger.info('[route53Update] Zone undefined, skipping update.');
      return false;
    }

    // See if we are running on AWS
    let ip: string = '<undefined>';
    try {
      const response = await this.fetch(ec2IpUrl, { timeout: 500 });
      ip = await response.text();
    } catch (err) {
      this.logger.info('[route53Update] Not running on EC2, skipping update');
      return false;
    }
    const recordSetName = baseUrl.replace(/\.$/, '') + '.';
    let success = false;
    let i = 0;
    while (!success && i < this.maxTimes) {
      i++;
      try {
        await new Promise((resolve, reject) => {
          const callback = (err: any) => {
            if (err) {
              return reject(err);
            }
            return resolve(true);
          };
          this.route53Updater('UPDATE', {
            hostedZoneId,
            recordSetName,
            type: 'A',
            ttl: 5,
            metadata: 'local-ipv4',
          }, callback);
        });
        this.logger.info(`[route53Update] Updated record for ${baseUrl} to ${ip}.`);
        success = true;
      } catch (err) {
        this.logger.info(`[route53Update] ${err.message}.`);
        if (typeof err.retryable === 'boolean' && !err.retryable) {
          i = this.maxTimes;
        }
        if (i < this.maxTimes) {
          this.logger.info(`[route53Update] Trying again in ${this.retryDelay}ms.`);
          await sleep(this.retryDelay);
        }
      }
    }
    return success;
  }
}
