
import { inject, injectable } from 'inversify';

import { AuthenticationModule } from '../authentication';
import { Event, EventBus, injectSymbol as eventBusInjectSymbol } from '../event-bus';
import { GitlabClient } from '../shared/gitlab-client';
import { SYSTEM_HOOK_REGISTRATION_EVENT_TYPE, SystemHookRegistrationEvent } from '../system-hook';

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');

interface SystemHookStatus {
  status: string;
  message?: string;
}

interface RunnerStatus {
  active: boolean;
  description: string;
  id: number;
  is_shared: boolean;
  name?: any;
}

@injectable()
export default class StatusModule {

  public static injectSymbol = Symbol('status-module');

  private readonly gitlab: GitlabClient;
  private readonly eventBus: EventBus;
  private readonly authentication: AuthenticationModule;

  private latestSystemHookRegistration: Event<SystemHookRegistrationEvent>;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(AuthenticationModule.injectSymbol) authentication: AuthenticationModule) {
    this.gitlab = gitlab;
    this.eventBus = eventBus;
    this.authentication = authentication;
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.eventBus
      .filterEvents<SystemHookRegistrationEvent>(SYSTEM_HOOK_REGISTRATION_EVENT_TYPE)
      .subscribe(event => {
        this.latestSystemHookRegistration = event;
      });
  }

  public getSystemHookStatus(): SystemHookStatus {
    if (!this.latestSystemHookRegistration) {
      return {
        status: 'error',
        message: 'No registration attempts yet',
      };
    }
    const status = this.latestSystemHookRegistration.payload.status;
    return {
      status: status === 'success' ? 'ok' : 'error',
      message: status === 'success' ?
        `Successfully registered ${this.latestSystemHookRegistration.created.fromNow()}` :
        this.latestSystemHookRegistration.payload.message,
    };
  }

  private async getRunnersStatus() {
    try {
      const runners = await this.gitlab.fetchJson<RunnerStatus[]>('runners/all/?scope=online');
      const activeRunners = runners.filter(runner => runner.active);
      return {
        status: activeRunners.length > 0 ? 'ok' : 'error',
        message: `${activeRunners.length} active runners`,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Could not get information on active runners.',
      };
    }
  }

  public async getGitlabStatus() {
    try {
      await this.getRunnersStatus();
      return {
        status: 'ok',
        statusCode: 200,
        message: 'Gitlab is responding',
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Gitlab is responding with statusCode ${err.output.statusCode}',
      };
    }
  }

  public async getPostgreSqlStatus() {
    try {
      const privateKey = this.authentication.getPrivateAuthenticationToken(1);
      if (!privateKey) {
        return {
          status: 'error',
          message: 'Received invalid data from PostgreSQL. Database not ready?',
        };
      }
      return {
        status: 'ok',
        message: 'Successfully fetched data from PostgreSQL',
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Could not fetch data from postgresql',
      };
    }
  }

  public async getStatus() {
    const postgreStatusPromise = this.getPostgreSqlStatus();
    const gitlabStatusPromise = this.getGitlabStatus();
    const runnersStatusPromise = this.getRunnersStatus();
    return {
       systemHook: this.getSystemHookStatus(),
       gitlab: await gitlabStatusPromise,
       runners: await runnersStatusPromise,
       postgresql: await postgreStatusPromise,
    };
  }

};
