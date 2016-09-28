
import * as Hapi from './hapi';

export interface HapiRegister {
  (server: Hapi.Server,
  _options: Hapi.IServerOptions,
  next: any): void;
  attributes?: any;
}
