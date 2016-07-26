
import { inject, injectable } from 'inversify';

// only for types
import { GitlabClient } from '../shared/gitlab-client'
import { SystemHook } from '../shared/gitlab.d.ts';


@injectable()
export default class SystemHookModule {

  public static injectSymbol = Symbol('system-hook-module');

  private gitlabClient: GitlabClient;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlabClient: GitlabClient) {
    this.gitlabClient = gitlabClient;
  }

  public async assureSystemHookRegistered(url: string) {
    function sleep(ms = 0) {
      return new Promise(r => setTimeout(r, ms));
    }
    let registered = false;
    while (!registered) {
      try {
        registered = await this.tryAssureSystemHookRegistered(url);
      } catch (err) {
        console.log('Could not register system hook for project-module. Trying again in 3 seconds');
        console.log(err);
        await sleep(3000);
      }
    }
  };

  public async tryAssureSystemHookRegistered(url: string) {
    if (!(await this.hasSystemHookRegistered(url))) {
      return await this.registerSystemHook(url);
    }
    try {
      return true;
    } catch (err) {
      console.log('Could not register system hook for project-module. Trying again in 3 seconds');
      console.log(err);
      return false;
    }
  }

  public async getSystemHooks() {
    return await this.gitlabClient.fetchJson<SystemHook[]>('/hooks');;
  }

  public async hasSystemHookRegistered(url: string) {
    const hooks = await this.getSystemHooks();
    const found = hooks.find((item: any) => {
      return item.url === url;
    });
    return typeof found === 'object';
  }

  public async registerSystemHook(hookUrl: string) {
    const url = `hooks?url=${encodeURIComponent(hookUrl)}`;
    const res = await this.gitlabClient.fetch(url, { method: 'POST' });
    return res.status === 200;
  }

}
