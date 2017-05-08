import * as Boom from 'boom';
import { inject, injectable } from 'inversify';

import { IFetch } from '../shared/fetch';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { fetchInjectSymbol } from '../shared/types';
import { PageresOptions, Screenshotter, screenshotterBaseurlInjectSymbol } from './types';

@injectable()
export class RemoteScreenshotter implements Screenshotter {

  public static injectSymbol = Symbol('screenshotter-client');

  public constructor(
    @inject(screenshotterBaseurlInjectSymbol) private readonly host: string,
    @inject(fetchInjectSymbol) private readonly fetch: IFetch,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    private readonly logging: boolean = false) {
    this.host = host.replace(/\/$/, '');
  }

  private log(msg: string): void {
    if (this.logging) {
      this.logger.info(msg);
    }
  }

  /**
   * Take a screenshot of a website and save to a file
   */
  public async save(url: string, dest: string, options?: PageresOptions): Promise<boolean> {
    this.log(`RemoteScreenshotter: sending a request to ${this.host}`);
    const body = {
      url,
      dest,
      options,
    };
    try {
      const response = await this.fetch(`${this.host}/save`, {
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

  public async ping(): Promise<void> {
    let response;
    try {
      response = await this.fetch(`${this.host}/health`, {
        method: 'GET',
        timeout: 0.5 * 60 * 1000,
      });
    } catch (error) {
      throw new Error(`Ping request to screenshotter failed`);
    }

    if (response.status !== 200) {
      throw new Error(`Unexpected status code ${response.status} for screenshotter`);
    }

    // Do some additional checks, so that we know that it
    // is really the screenshotter that is responding
    let text;
    try {
      text = await response.text();
    } catch (error) {
      throw new Error(`Could not read response text from screenshotter`);
    }
    if (text !== 'screenshotter ok') {
      throw new Error('Unexpected response from screenshotter');
    }
  }
}
