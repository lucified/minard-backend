export const screenshotterBaseurlInjectSymbol = Symbol('screenshotter-host');
export const screenshotterInjectSymbol = Symbol('screenshotter-client');
export const screenshotFolderInjectSymbol = Symbol('screenshot-folder');
export const screenshotUrlPattern = Symbol('screenshot-url-pattern');

export interface Screenshotter {
  save(url: string, dest: string, options?: PageresOptions): Promise<boolean>;
  ping(): Promise<void>;
}

export interface PageresOptions {
  delay?: number;
  timeout?: number;
  crop?: boolean;
  css?: string;
  script?: string;
  cookies?: string[];
  filename?: string; // https://github.com/sindresorhus/pageres#filename
  incrementalName?: boolean;
  selector?: string;
  hide?: string[];
  username?: string;
  password?: string;
  scale?: number; // 1
  format?: 'png' | 'jpg'; // png
  userAgent?: string;
  headers?: object;
}
