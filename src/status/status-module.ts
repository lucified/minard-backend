import { ECS } from 'aws-sdk';
import { exists as _exists, readFile as _readFile } from 'fs';
import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import * as moment from 'moment';
import { promisify } from 'util';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { Screenshotter, screenshotterInjectSymbol } from '../screenshot/types';
import { Event } from '../shared/events';
import { IFetch } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { fetchInjectSymbol } from '../shared/types';
import {
  SYSTEM_HOOK_REGISTRATION_EVENT_TYPE,
  SystemHookRegistrationEvent,
} from '../system-hook';

const exists = promisify<boolean, string>(_exists);
const readFile = promisify(_readFile);

const ecs = new ECS({
  region: process.env.AWS_DEFAULT_REGION || 'eu-west-1',
  httpOptions: {
    timeout: 300,
  },
});

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');

interface SystemStatus {
  [key: string]: Status;
  charles: Status;
  systemHook: Status;
  gitlab: Status;
  screenshotter: Status;
  runners: Status;
  postgresql: Status;
}

interface Status {
  active: boolean;
  status?: string;
  statusCode?: number;
  message?: string;
  ecs?: any;
}

interface RunnerStatus extends Status {
  active: boolean;
  description: string;
  id: number;
  is_shared: boolean;
  name?: any;
}

interface DetailedRunnerStatus extends Status {
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

  private latestSystemHookRegistration: Event<SystemHookRegistrationEvent>;
  private ip: string | undefined = undefined;

  public constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(screenshotterInjectSymbol)
    private readonly screenshotter: Screenshotter,
    @inject(eventBusInjectSymbol) private readonly eventBus: EventBus,
    @inject(AuthenticationModule.injectSymbol)
    private readonly authentication: AuthenticationModule,
    @inject(fetchInjectSymbol) private fetch: IFetch,
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.eventBus
      .filterEvents<SystemHookRegistrationEvent>(
        SYSTEM_HOOK_REGISTRATION_EVENT_TYPE,
      )
      .subscribe(event => {
        this.latestSystemHookRegistration = event;
      });
  }

  public getSystemHookStatus(): Status {
    if (!this.latestSystemHookRegistration) {
      return {
        active: false,
        status: 'error',
        message: 'No registration attempts yet',
      };
    }
    const status = this.latestSystemHookRegistration.payload.status;
    return {
      active: status === 'success',
      status: status === 'success' ? 'ok' : 'error',
      message: status === 'success'
        ? `Successfully verified ${this.latestSystemHookRegistration.created.fromNow()}`
        : undefined,
    };
  }

  private async getRunnersStatus(): Promise<Status> {
    try {
      const runners = await this.gitlab.fetchJson<RunnerStatus[]>(
        'runners/all/?scope=online',
      );
      const activeRunners = runners.filter(runner => runner.active);
      const detailedRunners = await Promise.all<DetailedRunnerStatus>(
        activeRunners.map((runner: RunnerStatus) => {
          return this.gitlab.fetchJson<DetailedRunnerStatus>(
            `runners/${runner.id}`,
          );
        }),
      );

      const timeDiffs = detailedRunners.map((runner: DetailedRunnerStatus) => {
        const diff = moment().diff(moment(runner.contacted_at), 'seconds');
        return {
          id: runner.id,
          diff,
        };
      });
      // gitlab does not seem to refresh the contacted_at time for every
      // request. with a working runner the diff seems to go at maximum
      // to around 80. Thus comparing to 240 should be a safe to way to
      // figure whether the runner is really OK
      const filtered = timeDiffs.filter(runner => runner.diff < 240);

      return {
        active: filtered.length > 0,
        status: filtered.length > 0 ? 'ok' : 'error',
        message: `${filtered.length} online runner(s)`,
      };
    } catch (err) {
      return {
        active: false,
        status: 'error',
        message: 'Could not get information on active runners.',
      };
    }
  }

  public async getGitlabStatus(): Promise<Status> {
    try {
      await this.gitlab.fetchJson<RunnerStatus[]>('runners/all/?scope=online');
      return {
        active: true,
        status: 'ok',
        statusCode: 200,
        message: 'Gitlab is responding',
      };
    } catch (err) {
      const message = err.output
        ? `Gitlab is responding with statusCode ${err.output.statusCode}`
        : `GitLab is not responding`;
      return {
        active: false,
        status: 'error',
        message,
      };
    }
  }

  public async getScreenshotterStatus(): Promise<Status> {
    try {
      await this.screenshotter.ping();
      return {
        active: true,
        status: 'ok',
        message: 'Screenshotter responds correctly to ping',
      };
    } catch (err) {
      return {
        active: false,
        status: 'error',
        // the message if safe for being public
        message: err.message,
      };
    }
  }

  public async getPostgreSqlStatus(): Promise<Status> {
    try {
      const privateKey = await this.authentication.getPrivateAuthenticationToken(
        1,
      );
      if (!privateKey) {
        return {
          active: false,
          status: 'error',
          message: 'Received invalid data from PostgreSQL. Database not ready?',
        };
      }
      return {
        active: true,
        status: 'ok',
        message: 'Successfully fetched data from PostgreSQL',
      };
    } catch (err) {
      return {
        active: false,
        status: 'error',
        message: 'Could not fetch data from PostgreSQL',
      };
    }
  }

  public async getEC2IP() {
    if (!this.ip) {
      const ec2IpUrl =
        'http://169.254.169.254/latest/meta-data/public-hostname';
      const response = await this.fetch(ec2IpUrl, { timeout: 500 });
      this.ip = await response.text();
    }
    return this.ip;
  }

  public async getStatus(withEcs = false) {
    const [
      gitlab,
      runners,
      postgresql,
      screenshotter,
      charlesVersion,
    ] = await Promise.all([
      this.getGitlabStatus(),
      this.getRunnersStatus(),
      this.getPostgreSqlStatus(),
      this.getScreenshotterStatus(),
      getCharlesVersion(),
    ]);

    const response = {
      charles: {
        active: true,
        version:
          charlesVersion || `Unknown (only available in production & staging)`,
      },
      gitlab,
      screenshotter,
      runners,
      postgresql,
    } as any;

    if (withEcs) {
      try {
        const ecsStatus = await getEcsStatus();
        const ip = await this.getEC2IP();
        if (ecsStatus.charles) {
          response.charles.ecs = ecsStatus.charles;
          response.charles.ecs.instance = ip;
        }
        if (ecsStatus.runner) {
          response.runners.ecs = ecsStatus.runner;
        }
        if (ecsStatus.screenshotter) {
          response.screenshotter.ecs = ecsStatus.screenshotter;
        }
        if (ecsStatus.gitlab) {
          response.gitlab.ecs = ecsStatus.gitlab;
        }
      } catch (err) {
        this.gitlab.logger.info("Can't get ECS status: %s", err.message);
      }
    }
    return response as SystemStatus;
  }
}

export async function getCharlesVersion(): Promise<string | undefined> {
  const filename = 'commit-sha';
  const fileExists = await exists(filename);
  return fileExists
    ? (await readFile('commit-sha')).toString().trim()
    : undefined;
}

export async function getEcsStatus(_env?: string) {
  // Yes, we access an environment variable here. It's bad. Don't do it.
  const env = _env || process.env.LUCIFY_ENV;

  if (env !== 'staging' && env !== 'production') {
    throw new Error('ECS status can be fetched only in staging and production');
  }
  const services = ['charles', 'gitlab', 'runner', 'screenshotter'];
  const servicesResponse = await ecs
    .describeServices({
      services: services.map(service => `minard-${service}-${env}`),
      cluster: 'minard',
    })
    .promise();
  const serviceData = await Promise.all(
    servicesResponse.services!.map(async (service: any, i: number) => {
      const taskDefinition = await ecs
        .describeTaskDefinition({ taskDefinition: service.taskDefinition })
        .promise()
        .then(x => x.taskDefinition);
      const container = taskDefinition!.containerDefinitions!.find(
        _container => _container.name === services[i],
      );
      let image = 'unknown';
      if (container) {
        const _image = container.image!.split('/').pop();
        if (_image) {
          image = _image;
        }
      }

      return {
        ...pick<
          { serviceName: string; status: string; runningCount: number },
          any
        >(service, ['serviceName', 'status', 'runningCount']),
        revision: parseInt(service.taskDefinition.split(':').pop(), 10),
        image,
        environment: env,
      };
    }),
  );

  return serviceData.reduce((response: any, service: any, i: number) => {
    return { ...response, [services[i]]: service };
  }, {});
}
