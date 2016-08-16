
import { createSystemHookRegistrationEvent } from './types';
import { inject, injectable } from 'inversify';

import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import { SystemHook } from '../shared/gitlab.d.ts';
import { Logger, loggerInjectSymbol} from '../shared/logger';

const urljoin = require('url-join');

export const systemHookBaseUrlSymbol = Symbol('system-hook-base-url');

@injectable()
export default class SystemHookModule {

  public static injectSymbol = Symbol('system-hook-module');

  private gitlabClient: GitlabClient;
  private baseUrl: string;
  private bus: EventBus;
  private logger: Logger;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlabClient: GitlabClient,
    @inject(systemHookBaseUrlSymbol) baseUrl: string,
    @inject(eventBusInjectSymbol) bus: EventBus,
    @inject(loggerInjectSymbol) logger: Logger) {
    this.gitlabClient = gitlabClient;
    this.baseUrl = baseUrl;
    this.bus = bus;
    this.logger = logger;
  }

  public getUrl(path: string) {
    return urljoin(this.baseUrl, path);
  }

  public async assureSystemHookRegistered(path: string) {
    function sleep(ms = 0) {
      return new Promise(r => setTimeout(r, ms));
    }
    let registered = false;
    while (!registered) {
      try {
        registered = await this.tryAssureSystemHookRegistered(path);
        this.bus.post(createSystemHookRegistrationEvent({ status: 'success', path }));
        this.logger.info(`Registered system hook for path "${path}"`);

    } catch (err) {
        this.bus.post(createSystemHookRegistrationEvent({
            status: 'failed',
            path,
            message: err.message,
          }));
        await sleep(3000);
      }
    }
  };

  public async tryAssureSystemHookRegistered(path: string) {
    if (!(await this.hasSystemHookRegistered(path))) {
      return await this.registerSystemHook(path);
    }
    return true;
  }

  public async getSystemHooks() {
    return await this.gitlabClient.fetchJson<SystemHook[]>('/hooks');
  }

  public async hasSystemHookRegistered(path: string) {
    const hooks = await this.getSystemHooks();
    const found = hooks.find((item: any) => {
      return item.url === this.getUrl(path);
    });
    return typeof found === 'object';
  }

  public async registerSystemHook(path: string) {
    const url = `hooks?url=${encodeURIComponent(this.getUrl(path))}`;
    const res = await this.gitlabClient.fetch(url, { method: 'POST' });
    return res.status === 200;
  }

}
