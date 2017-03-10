import * as AWS from 'aws-sdk';
import { inject, injectable } from 'inversify';

import { IFetch } from './fetch';
import { Logger, loggerInjectSymbol } from './logger';
import { promisify } from './promisify';
import { sleep } from './sleep';
import { fetchInjectSymbol } from './types';

export interface ChangeInfo {
  Status: 'INSYNC' | 'PENDING';
  Id: string;
}
export type Route53UpdaterFunction = (
    values: {Value: string}[],
    hostedZoneId: string,
    name: string,
    type: string,
    ttl: number,
  ) => Promise<{ChangeInfo: ChangeInfo}>;

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
  private syncDelay: number;
  private maxTimes: number;
  private route53: any;
  private changeResourceRecordSets: any;
  private getChange: any;
  private listResourceRecordSets: any;

  public constructor(
    @inject(fetchInjectSymbol) fetch: IFetch,
    @inject(loggerInjectSymbol) logger: Logger,
    retryDelay = 200,
    syncDelay = 5000,
    maxTimes = 5,
    updateRecordSet?: Route53UpdaterFunction) {
    this.logger = logger;
    this.fetch = fetch;
    this.retryDelay = retryDelay;
    this.syncDelay = syncDelay;
    this.maxTimes = maxTimes;
    // For unit testing
    if (updateRecordSet) {
      this.updateRecordSet = updateRecordSet;
      const changeInfo = {ChangeInfo: {Status: 'INSYNC', Id: 'foo'}};
      this.changeResourceRecordSets = () => Promise.resolve(changeInfo);
      this.getChange = () => Promise.resolve(changeInfo);
      this.listResourceRecordSets = Promise.resolve({ResourceRecords: ['5.6.7.8']});
    } else {
      this.route53 = new (<any> AWS).Route53();
      this.changeResourceRecordSets = promisify(this.route53.changeResourceRecordSets, this.route53);
      this.getChange = promisify(this.route53.getChange, this.route53);
      this.listResourceRecordSets = promisify(this.route53.listResourceRecordSets, this.route53);
    }
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
      this.logger.info(`Local ip: ${ip}`);
    } catch (err) {
      this.logger.info('[route53Update] Not running on EC2, skipping update');
      return false;
    }
    const recordSetName = baseUrl.replace(/\.$/, '') + '.';
    const ips = [{Value: ip}];

    let success = false;
    let i = 0;
    while (!success && i < this.maxTimes) {
      i++;
      try {
        const result = await this.updateRecordSet(ips, hostedZoneId, recordSetName);
        const insync = await this.checkINSYNC(result.ChangeInfo, this.syncDelay);
        if (insync) {
          this.logger.info(`[route53Update] Updated record for ${baseUrl} to %j.`, ips.map(value => value.Value));
        }
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

  // Note: copied pretty much directly from route53-updater node package
  private updateRecordSet(
    values: {Value: string}[],
    hostedZoneId: string,
    name: string,
    type = 'A',
    ttl = 5): Promise<any> {
    const params = {
      'ChangeBatch': {
        'Changes': [{
          'Action': 'UPSERT',
          'ResourceRecordSet': {
            'Name': name,
            'Type': type,
            'TTL': ttl,
            'ResourceRecords': values,
          },
        }],
        'Comment': 'updateRecordSet()',
      },
      'HostedZoneId': hostedZoneId,
    };
    return this.changeResourceRecordSets(params);
  }

  // Note: copied pretty much directly from route53-updater node package
  private async checkINSYNC(changeInfo: ChangeInfo, delay = 3000, counter = 0, maxTimes = 20): Promise<boolean> {
    if (counter >= maxTimes) {
      this.logger.info(`[route53Update] Update didn't complete in ${Math.round((maxTimes * delay) / 1000)}s.`);
      return false;
    }
    if (changeInfo.Status === 'PENDING') {
      this.logger.info(`[route53Update] Update is pending, sleeping for ${delay}ms.`);
      await sleep(delay);
      const res = await this.getChange({ 'Id': changeInfo.Id });
      return this.checkINSYNC(res.ChangeInfo, delay, ++counter, maxTimes);
    } else if (changeInfo.Status === 'INSYNC') {
      return true;
    }
    throw new Error('unsupported status ' + changeInfo.Status);

  }

}
