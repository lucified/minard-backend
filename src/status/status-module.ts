
import { inject, injectable } from 'inversify';
import * as moment from 'moment';
import { tmpdir } from 'os';
import { join } from 'path';

import { AuthenticationModule } from '../authentication';
import { Event, EventBus, eventBusInjectSymbol } from '../event-bus';
import { Screenshotter, screenshotterInjectSymbol } from '../screenshot/types';
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

interface DetailedRunnerStatus {
  id: number;
  description: string;
  active: boolean;
  is_shared: boolean;
  name: string;
  tag_list: any[];
  run_untagged: boolean;
  locked: boolean;
  version: string;
  revision: string;
  platform: string;
  architecture: string;
  contacted_at: Date;
  token: string;
  projects: any[];
}

@injectable()
export default class StatusModule {

  public static injectSymbol = Symbol('status-module');

  private readonly gitlab: GitlabClient;
  private readonly screenshotter: Screenshotter;
  private readonly eventBus: EventBus;
  private readonly authentication: AuthenticationModule;

  private latestSystemHookRegistration: Event<SystemHookRegistrationEvent>;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(screenshotterInjectSymbol) screenshotter: Screenshotter,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(AuthenticationModule.injectSymbol) authentication: AuthenticationModule) {
    this.gitlab = gitlab;
    this.screenshotter = screenshotter;
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
        `Successfully verified ${this.latestSystemHookRegistration.created.fromNow()}` :
        this.latestSystemHookRegistration.payload.message,
    };
  }

  private async getRunnersStatus() {
    try {
      const runners = await this.gitlab.fetchJson<RunnerStatus[]>('runners/all/?scope=online');
      const activeRunners = runners.filter(runner => runner.active);
      const detailedRunners = await Promise.all<DetailedRunnerStatus>(activeRunners.map((runner: RunnerStatus) => {
        return this.gitlab.fetchJson<DetailedRunnerStatus>(`runners/${runner.id}`);
      }));

      const timeDiffs = detailedRunners.map((runner: DetailedRunnerStatus) => {
        const diff = moment().diff(moment(runner.contacted_at), 'seconds');
        return {
          id: runner.id,
          diff,
        };
      });
      // gitlab does not seem to refresh the contacted_at time for every
      // request. with a working runner the diff seems to go at maximum
      // to around 80. Thus comparing to 120 should be a safe to way to
      // figure whether the runner is really OK
      const filtered = timeDiffs.filter((runner) => runner.diff < 120);

      return {
        status: filtered.length > 0 ? 'ok' : 'error',
        message: `${filtered.length} online runner(s)`,
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
      await this.gitlab.fetchJson<RunnerStatus[]>('runners/all/?scope=online');
      return {
        status: 'ok',
        statusCode: 200,
        message: 'Gitlab is responding',
      };
    } catch (err) {
      return {
        status: 'error',
        message: `Gitlab is responding with statusCode ${err.output.statusCode}`,
      };
    }
  }

  public async getScreenshotterStatus() {
    const imageFile = join(tmpdir(), 'status-screenshot-test.jpg');
    const url = 'https://google.com';
    try {
      await this.screenshotter.webshot(url, imageFile);
      return {
        status: 'ok',
        statusCode: 200,
        message: `Succesfully took a screenshot of '${url}'`,
      };
    } catch (err) {
      return {
        status: 'error',
        message: `Screenshotter: ${err.message}`,
      };
    }
  }

  public async getPostgreSqlStatus() {
    try {
      const privateKey = await this.authentication.getPrivateAuthenticationToken(1);
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
    const screenshotterStatusPromise = this.getScreenshotterStatus();

    const systemHook = this.getSystemHookStatus();
    const gitlab = await gitlabStatusPromise;
    const runners = await runnersStatusPromise;
    const postgresql = await postgreStatusPromise;
    const screenshotter = await screenshotterStatusPromise;

    return {
       systemHook,
       gitlab,
       screenshotter,
       runners,
       postgresql,
    };
  }

};
