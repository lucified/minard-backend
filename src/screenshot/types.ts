
import { eventCreator } from '../shared/events';

export const screenshotterBaseurlInjectSymbol = Symbol('screenshotter-host');
export const screenshotterInjectSymbol = Symbol('screenshotter-client');
export const screenshotFolderInjectSymbol = Symbol('screenshot-folder');
export const screenshotUrlPattern = Symbol('screenshot-url-pattern');

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
