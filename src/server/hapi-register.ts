import { injectable } from 'inversify';
import * as Hapi from './hapi';

export interface HapiRegister {
  (server: Hapi.Server, _options: Hapi.ServerOptions, next: any): void;
  attributes?: any;
}

interface HapiPluginAttributes {
  name: string;
  version: string;
}

@injectable()
export abstract class HapiPlugin {
  constructor(attributes: HapiPluginAttributes) {
    this.register = Object.assign(this.register.bind(this), { attributes });
  }
  public abstract register(
    server: Hapi.Server,
    options: Hapi.ServerOptions,
    next: () => void,
  ): any;
}
