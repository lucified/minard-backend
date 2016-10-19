
import { ECS } from 'aws-sdk';
import { inject, injectable } from 'inversify';
import * as _ from 'lodash';
import * as moment from 'moment';

import { AuthenticationModule } from '../authentication';
import { Event, EventBus, eventBusInjectSymbol } from '../event-bus';
import { Screenshotter, screenshotterInjectSymbol } from '../screenshot/types';
import { IFetch } from '../shared/fetch';
import { GitlabClient } from '../shared/gitlab-client';
import { promisify } from '../shared/promisify';
import { fetchInjectSymbol } from '../shared/types';
import { SYSTEM_HOOK_REGISTRATION_EVENT_TYPE, SystemHookRegistrationEvent } from '../system-hook';

const ecs = new ECS({
  region: process.env.AWS_DEFAULT_REGION || 'eu-west-1',
  httpOptions: {
    timeout: 300,
  },
});
const describeServices = promisify<any>(ecs.describeServices, ecs);
type describeTaskDefinitionFunc = (params: any) => Promise<{ taskDefinition: RegisteredTaskDefinition }>;
const describeTaskDefinition: describeTaskDefinitionFunc = promisify<any>(ecs.describeTaskDefinition, ecs);

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

interface Container { image: string; environment: string; name: string; }
interface TaskDefinition {
  family: string;
  volumes?: any;
  containerDefinitions: Container[];
}
interface RegisteredTaskDefinition extends TaskDefinition {
  taskDefinitionArn: string;
  revision: number;
  status: string;
}

@injectable()
export default class StatusModule {

  public static injectSymbol = Symbol('status-module');

  private readonly gitlab: GitlabClient;
  private readonly screenshotter: Screenshotter;
  private readonly eventBus: EventBus;
  private readonly authentication: AuthenticationModule;
  private latestSystemHookRegistration: Event<SystemHookRegistrationEvent>;
  private fetch: IFetch;
  private ip: string|undefined = undefined;

  public constructor(
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(screenshotterInjectSymbol) screenshotter: Screenshotter,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(AuthenticationModule.injectSymbol) authentication: AuthenticationModule,
    @inject(fetchInjectSymbol) fetch: IFetch) {
    this.gitlab = gitlab;
    this.screenshotter = screenshotter;
    this.eventBus = eventBus;
    this.authentication = authentication;
    this.fetch = fetch;
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    this.eventBus
      .filterEvents<SystemHookRegistrationEvent>(SYSTEM_HOOK_REGISTRATION_EVENT_TYPE)
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
      message: status === 'success' ?
        `Successfully verified ${this.latestSystemHookRegistration.created.fromNow()}` :
        this.latestSystemHookRegistration.payload.message,
    };
  }

  private async getRunnersStatus(): Promise<Status> {
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
      return {
        active: false,
        status: 'error',
        message: `Gitlab is responding with statusCode ${err.output.statusCode}`,
      };
    }
  }

  public async getScreenshotterStatus(): Promise<Status> {
    try {
      await this.screenshotter.ping();
      return {
        active: true,
        status: 'ok',
      };
    } catch (err) {
      return {
        active: false,
        status: 'error',
        message: `Screenshotter: ${err.message}`,
      };
    }
  }

  public async getPostgreSqlStatus(): Promise<Status> {
    try {
      const privateKey = await this.authentication.getPrivateAuthenticationToken(1);
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
        message: 'Could not fetch data from postgresql',
      };
    }
  }

  public async getEC2IP() {
    if (!this.ip) {
      const ec2IpUrl = 'http://169.254.169.254/latest/meta-data/public-hostname';
      const response = await this.fetch(ec2IpUrl, { timeout: 500 });
      this.ip = await response.text();
    }
    return this.ip;
  }

  public async getStatus(withEcs = false) {
    const [gitlab, runners, postgresql, screenshotter, systemHook] = await Promise.all([
      this.getGitlabStatus(),
      this.getRunnersStatus(),
      this.getPostgreSqlStatus(),
      this.getScreenshotterStatus(),
      this.getSystemHookStatus(),
    ]);

    const response = {
      charles: {
        active: true,
      },
      systemHook,
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
        this.gitlab.logger.info('Can\'t get ECS status: %s', err.message);
      }
    }
    return response as SystemStatus;
  }

};

export async function getEcsStatus(_env?: string) {

  // Yes, we access an environment variable here. It's bad. Don't do it.
  const env = _env || process.env.LUCIFY_ENV;

  if (env !== 'staging' && env !== 'production') {
    throw new Error('ECS status can be fetched only in staging and production');
  }
  const services = ['charles', 'gitlab', 'runner', 'screenshotter'];
  const servicesResponse = await describeServices({
    services: services.map(service => `minard-${service}-${env}`),
    cluster: 'minard',
  });
  const serviceData = await Promise.all(servicesResponse.services.map(async (service: any, i: number) => {

    const taskDefinition = (await describeTaskDefinition({ taskDefinition: service.taskDefinition })).taskDefinition;
    const container = taskDefinition.containerDefinitions.find(_container => _container.name === services[i]);
    let image = 'unknown';
    if (container) {
      const _image = container.image.split('/').pop();
      if (_image) {
        image = _image;
      }
    }

    return Object.assign(_.pick(service, [
      'serviceName',
      'status',
      'runningCount',
    ]), {
        revision: parseInt(service.taskDefinition.split(':').pop(), 10),
        image,
        environment: env,
      });
  }));

  return serviceData.reduce((response: any, service: any, i: number) => {
    return Object.assign({}, response, { [services[i]]: service });
  }, {});

}
