
import { eventCreator } from '../shared/events';

export const screenshotterBaseurlInjectSymbol = Symbol('screenshotter-host');
export const screenshotterInjectSymbol = Symbol('screenshotter-client');
export const screenshotHostInjectSymbol = Symbol('screenshot-host');
export const screenshotPortInjectSymbol = Symbol('screenshot-port');
export const screenshotFolderInjectSymbol = Symbol('screenshot-folder');

export interface Screenshotter {
  webshot(websiteUrl: string, imageFile: string, webshotOptions?: any): Promise<boolean>;
}

export interface ScreenshotEvent {
  readonly projectId: number;
  readonly deploymentId: number;
  readonly url: string;
}

export const SCREENSHOT_EVENT_TYPE = 'SCREENSHOT_EVENT_TYPE';
export const createScreenshotEvent =
  eventCreator<ScreenshotEvent>(SCREENSHOT_EVENT_TYPE);
