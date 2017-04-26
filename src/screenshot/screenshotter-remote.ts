import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { fetch } from '../shared/fetch';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { Screenshotter, screenshotterBaseurlInjectSymbol } from './types';

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
    this.host = host.replace(/\/$/, '') + '/';
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

  public async ping(): Promise<void> {
    let response;
    try {
      response = await fetch(this.host, {
        method: 'GET',
        timeout: 0.5 * 60 * 1000,
      });
    } catch (error) {
      throw new Error(`Ping request to screenshotter failed`);
    }
    // Do some additional checks, so that we know that it
    // is really the screenshotter that is responding
    //
    // TODO: add proper health check endpoint for screenshotter
    // and use that one for this ping function.
    // Currently we use the regular endpoint for taking screenshots.
    // Without parameters it is expected to return status code 400
    if (response.status !== 400) {
      throw new Error(`Unexpected status code ${response.status} for screenshotter`);
    }
    let json;
    try {
      json = await response.json();
    } catch (error) {
      throw new Error(`Response from screenshotter is not valid JSON`);
    }
    if (json.statusCode !== 400) {
      throw new Error(`Unexpected message content from screenshotter`);
    }
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
    try {
      const response = await fetch(host.replace(/\/$/, '') + '/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        timeout: 0.5 * 60 * 1000,
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
