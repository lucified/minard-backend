import { Response } from '../shared/fetch';

export const screenshotterBaseurlInjectSymbol = Symbol('screenshotter-host');
export const screenshotterInjectSymbol = Symbol('screenshotter-client');
export const screenshotFolderInjectSymbol = Symbol('screenshot-folder');
export const screenshotUrlPattern = Symbol('screenshot-url-pattern');

export interface Screenshotter {
  webshot(websiteUrl: string, imageFile: string, webshotOptions?: any): Promise<boolean>;
  ping(): Promise<Response>;
}
