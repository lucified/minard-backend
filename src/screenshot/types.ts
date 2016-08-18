
import { eventCreator } from '../shared/events';

export const webshotInjectSymbol = Symbol('webshot');
export const screenshotHostInjectSymbol = Symbol('screenshot-host');
export const screenshotPortInjectSymbol = Symbol('screenshot-port');
export const screenshotFolderInjectSymbol = Symbol('screenshot-folder');

export interface ScreenshotEvent {
  readonly projectId: number;
  readonly deploymentId: number;
  readonly url: string;
}

export const SCREENSHOT_EVENT_TYPE = 'SCREENSHOT_EVENT_TYPE';
export const createScreenshotEvent =
  eventCreator<ScreenshotEvent>(SCREENSHOT_EVENT_TYPE);
