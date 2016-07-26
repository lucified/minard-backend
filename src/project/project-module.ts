
import { inject, injectable } from 'inversify';

// only for types
import AuthenticationModule from '../authentication/authentication-module';
import { EventBus } from '../event-bus/event-bus';
import SystemHookModule from '../system-hook/system-hook-module';


@injectable()
export default class ProjectModule {

  public static injectSymbol = Symbol('user-module');

  private internalServerUrl: string;
  private authenticationModule: AuthenticationModule;
  private systemHookModule: SystemHookModule;
  private eventBus: EventBus;

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(SystemHookModule.injectSymbol) systemHookModule: SystemHookModule,
    @inject(EventBus.injectSymbol) eventBus: EventBus,
    @inject('internal-server-url') internalServerUrl: string) {
    this.authenticationModule = authenticationModule;
    this.systemHookModule = systemHookModule;
    this.internalServerUrl = internalServerUrl;
    this.eventBus = eventBus;
  }

  public async assureSystemHookRegistered() {
    return await this.systemHookModule
      .assureSystemHookRegistered(this.getSystemHookUrl());
  }

  public receiveHook(payload: any) {
    if (payload.event_name === 'project_create') {
      const event = {
        type: 'project-created',
        projectId: payload.project_id,
        pathWithNameSpace: payload.path_with_namespace,
      };
      this.eventBus.post(event);
    }
  }

  private getSystemHookUrl() {
    return `${this.internalServerUrl}/project/hook`;
  }

}
