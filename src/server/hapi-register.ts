
import * as Hapi from './hapi';

export interface HapiRegister {
  (server: Hapi.Server,
  _options: Hapi.IServerOptions,
  next: any): void;
  attributes?: any;
}

interface HapiPluginAttributes {
  name: string;
  version: string;
}

export abstract class HapiPlugin {
  constructor(attributes: HapiPluginAttributes) {
    this.register = Object.assign(this.register.bind(this), attributes);
  }
  public abstract register(server: Hapi.Server, options: Hapi.IServerOptions, next: () => void): any;
}
