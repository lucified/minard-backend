import { Observable } from '@reactivex/rxjs';
import { inject, injectable } from 'inversify';

import { IFetch } from './fetch';
import { Logger, loggerInjectSymbol } from './logger';
import { fetchInjectSymbol } from './types';


export const locatorBaseUrlInjectSymbol = Symbol('locator-base-url');

// The IP below is the IP for the AWS metadata URL
const ec2IpUrl = 'http://169.254.169.254/latest/meta-data/local-ipv4';
@injectable()
export class ServiceRegistrator {

  public static injectSymbol = Symbol('service-registrator');

  public readonly host: string;
  public readonly apiPrefix: string = '/api/v3';
  public readonly authenticationHeader = 'PRIVATE-TOKEN';

  private logger: Logger;
  private fetch: IFetch;
  private locator: string;
  private retryDelay: number;

  public constructor(
    @inject(locatorBaseUrlInjectSymbol) locator: string,
    @inject(fetchInjectSymbol) fetch: IFetch,
    @inject(loggerInjectSymbol) logger: Logger,
    retryDelay = 1000) {
    this.locator = locator;
    this.logger = logger;
    this.fetch = fetch;
    this.retryDelay = retryDelay;
  }

  public async register(name = 'charles') {

    if (!this.locator) {
      this.logger.info('[DNS] Base url for the locator service is undefined, skipping service registration.');
      return false;
    }

    // See if we are running on AWS
    let ip: string = '<undefined>';
    try {
      const response = await this.fetch(ec2IpUrl);
      ip = await response.text();
    } catch (err) {
      this.logger.debug('[DNS] Unable to get EC2 ip.');
    }

    // Try to register with the register service
    const success = await Observable.interval(this.retryDelay)
      .flatMap(async (i) => {
        try {
          const response = await this.fetch(this.locator + '/' + name, {method: 'PUT'});
          return response.status === 200;
        } catch (err) {
          return false;
        }
      })
      .takeWhile((result, i) => {
        const retry = result === false && i <= 5;
        if (retry) {
          this.logger.info('[DNS] Retrying in %sms', this.retryDelay);
        }
        return retry;
      })
      .toPromise();

    if (success) {
      this.logger.info('[DNS] Registered %s for ip %s', name, ip);
    } else {
      this.logger.info('[DNS] Failed to register %s for ip %s', name, ip);
    }
    return success;
  }
}
