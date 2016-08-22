
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { Logger, loggerInjectSymbol } from '../shared/logger';
import { Screenshotter, screenshotterBaseurlInjectSymbol } from './types';

const _fetch = require('node-fetch');

@injectable()
export class RemoteScreenshotter implements Screenshotter {

  public static injectSymbol = Symbol('screenshotter-client');

  public readonly host: string;
  private logger: Logger;
  private logging: boolean;

  public constructor(
    @inject(screenshotterBaseurlInjectSymbol) host: string,
    @inject(loggerInjectSymbol) logger: Logger,
    logging: boolean = false) {
    this.host = host;
    this.logger = logger;
    this.logging = logging;
  }

  private log(msg: string): void {
    if (this.logging) {
      this.logger.info(msg);
    }
  }

  /**
   * Take a screenshot of a website and save to a file
   */
  public async webshot(websiteUrl: string, imageFile: string, webshotOptions?: any): Promise<boolean> {
    this.log(`RemoteScreenshotter: sending a request to ${this.host}`);
    return RemoteScreenshotter.webshot(this.host, websiteUrl, imageFile, webshotOptions);
  }

  public static async webshot(
    host: string,
    websiteUrl: string,
    imageFile: string,
    webshotOptions?: any): Promise<boolean> {
    const body = {
      url: websiteUrl,
      fileName: imageFile,
      options: webshotOptions || {},
    };
    console.log(body);
    try {
      const response = await _fetch(host.replace(/\/$/, '') + '/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        timeout: 2 * 60 * 1000,
      });
      if (response.status !== 200) {
        throw Boom.create(response.status, response.statusText);
      }
      return true;
    } catch (err) {
      throw Boom.wrap(err);
    }
  }
}
