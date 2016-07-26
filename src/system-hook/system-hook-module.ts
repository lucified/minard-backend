
import { inject, injectable } from 'inversify';

// only for types
import AuthenticationModule from '../authentication/authentication-module';

@injectable()
export default class SystemHookModule {

  public static injectSymbol = Symbol('system-hook-module');

  private authenticationModule: AuthenticationModule;
  private fetch: typeof fetch;

  public constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject('fetch') fetchArg: typeof fetch) {
    this.authenticationModule = authenticationModule;
    this.fetch = fetchArg;
  }

  public async assureSystemHookRegistered(url: string) {
    function sleep(ms = 0) {
      return new Promise(r => setTimeout(r, ms));
    }
    let registered = false;
    while (!registered) {
      registered = await this.tryAssureSystemHookRegistered(url);
      await sleep(3000);
    }
  };

  public async tryAssureSystemHookRegistered(url: string) {
    try {
      if (!(await this.hasSystemHookRegistered(url))) {
        return await this.registerSystemHook(url);
      }
      return true;
    } catch (err) {
      console.log('Could not register system hook for project-module. Trying again in 3 seconds');
      console.log(err);
      return false;
    }
  }

  public async getSystemHooks() {
    const token = await this.authenticationModule.getRootAuthenticationToken();
    const url = `/hooks?private_token=${token}`;
    const hooks = (await this.fetch(url)).json();
    return hooks;
  }

  public async hasSystemHookRegistered(url: string) {
    const hooks = await this.getSystemHooks();
    const found = hooks.find((item: any) => {
      return item.url === url;
    });
    return typeof found === 'object';
  }

  public async registerSystemHook(hookUrl: string) {
    const token = await this.authenticationModule.getRootAuthenticationToken();
    const url = `hooks?private_token=${token}&url=${encodeURIComponent(hookUrl)}`;
    const res = await this.fetch(url, { method: 'POST' });
    return res.status === 200;
  }

}
