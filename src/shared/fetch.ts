import { Readable } from 'stream';

export const fetch: IFetch = require('node-fetch');

interface Request extends Body {
  method: string;
  url: string;
  headers: Headers;
  context: RequestContext;
  referrer: string;
  mode: RequestMode;
  redirect: RequestRedirect;
  credentials: RequestCredentials;
  cache: RequestCache;
}

export interface RequestInit {
  method?: string;
  headers?: HeaderInit | { [index: string]: string };
  body?: BodyInit;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  timeout?: number;
}

type RequestContext =
  'audio' | 'beacon' | 'cspreport' | 'download' | 'embed' |
  'eventsource' | 'favicon' | 'fetch' | 'font' | 'form' | 'frame' |
  'hyperlink' | 'iframe' | 'image' | 'imageset' | 'import' |
  'internal' | 'location' | 'manifest' | 'object' | 'ping' | 'plugin' |
  'prefetch' | 'script' | 'serviceworker' | 'sharedworker' |
  'subresource' | 'style' | 'track' | 'video' | 'worker' |
  'xmlhttprequest' | 'xslt';
type RequestMode = 'same-origin' | 'no-cors' | 'cors';
type RequestRedirect = 'follow' | 'error' | 'manual';
type RequestCredentials = 'omit' | 'same-origin' | 'include';
type RequestCache =
  'default' | 'no-store' | 'reload' | 'no-cache' |
  'force-cache' | 'only-if-cached';

export interface Headers {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(callback: (value: string, name: string) => void): void;
}

interface Body {
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  formData(): Promise<FormData>;
  json(): Promise<any>;
  json<T>(): Promise<T>;
  text(): Promise<string>;
}

export interface Response extends Body {
  error(): Response;
  redirect(url: string, status: number): Response;
  type: ResponseType;
  url: string;
  status: number;
  ok: boolean;
  statusText: string;
  headers: Headers;
  clone(): Response;
}

interface ResponseConstructor {
  new (body: Readable, opts: ResponseInit): Response;
}

interface RequestConstructor {
  new (url: string, opts?: RequestInit): Request;
}

interface HeadersConstructor {
  new (headers: any): Headers;
}

type ResponseType = 'basic' | 'cors' | 'default' | 'error' | 'opaque' | 'opaqueredirect';

interface ResponseInit {
  status: number;
  statusText?: string;
  headers?: HeaderInit;
}

type HeaderInit = Headers | string[];
type BodyInit = ArrayBuffer | ArrayBufferView | Blob | FormData | string;

export interface IFetch {
  (url: string | Request, init?: RequestInit): Promise<Response>;
  Response: ResponseConstructor;
  Request: RequestConstructor;
  Headers: HeadersConstructor;
}

export interface FetchMock {
  fetchMock: IFetch;
  restore: () => this;
  reset: () => this;
  mock: (matcher: any, response: any, options?: any) => this;
  get: (matcher: any, response: any, options?: any) => this;
  post: (matcher: any, response: any, options?: any) => this;
  called: (name?: string) => boolean;
}

let _fetchMock: any;
try {
  _fetchMock = require('fetch-mock');
} catch (err) {
  _fetchMock = {};
}
export const fetchMock: FetchMock = _fetchMock;
