
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as _webshot from 'webshot';

import { Logger, loggerInjectSymbol } from '../shared/logger';
import { Screenshotter } from './types';

const bluebird = require('bluebird');
const webshot = bluebird.promisify(_webshot);

@injectable()
export class LocalScreenshotter implements Screenshotter {

  private logger: Logger;
  private _logging: boolean;

  public constructor(@inject(loggerInjectSymbol) logger: Logger, logging: boolean = false) {
    this.logger = logger;
    this._logging = logging;
  }

  private log(msg: string): void {
    if (this._logging) {
      this.logger.info(msg);
    }
  }

  /**
   * Take a screenshot of a website and save to a file
   */
  public async webshot(websiteUrl: string, imageFile: string, webshotOptions?: any): Promise<boolean> {
    this.log(`LocalScreenshotter: taking a shot of ${websiteUrl}`);
    return LocalScreenshotter.webshot(websiteUrl, imageFile, webshotOptions);
  }

  /**
   * Take a screenshot of a website and save to a file
   */
  public static async webshot(websiteUrl: string , imageFile: string, webshotOptions?: any): Promise<boolean> {
    try {
      await webshot(websiteUrl, imageFile, webshotOptions || {});
      return true;
    } catch (err) {
      throw Boom.wrap(err);
    }
  }

}
