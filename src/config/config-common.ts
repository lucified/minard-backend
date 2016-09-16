import { KernelModule } from 'inversify';

// Imports below should be in alphabetical order, based
// on the last part of the import path.

import { ActivityModule } from '../activity';
import { AuthenticationModule } from '../authentication';

import {
  CIProxy,
  DeploymentHapiPlugin,
  DeploymentModule,
} from '../deployment';
import {
  PersistentEventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import {
  GitlabClient,
} from '../shared/gitlab-client';

import {
  fetchInjectSymbol,
} from '../shared/types';

import {
  JsonApiHapiPlugin,
  JsonApiModule,
  MemoizedJsonApiModule,
} from '../json-api';

import Migrations from '../migrations';

import {
  OperationsHapiPlugin,
  OperationsModule,
} from '../operations';

import {
  ProjectHapiPlugin,
  ProjectModule,
} from '../project';

import {
  ScreenshotHapiPlugin,
  ScreenshotModule,
  screenshotterInjectSymbol,
} from '../screenshot';

import {
  RemoteScreenshotter,
} from '../screenshot/screenshotter-remote';

import {
  RealtimeHapiPlugin,
} from '../realtime';

import { MinardServer } from '../server';

import {
  StatusHapiPlugin,
  StatusModule,
} from '../status';

import { SystemHookModule } from '../system-hook';
import { UserModule } from '../user';

export default new KernelModule(bind => {

  // Bindings for modules
  bind(ActivityModule.injectSymbol).to(ActivityModule).inSingletonScope();
  bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);
  bind(DeploymentModule.injectSymbol).to(DeploymentModule).inSingletonScope();
  bind(JsonApiModule.injectSymbol).to(MemoizedJsonApiModule);
  bind(JsonApiModule.factoryInjectSymbol).toAutoFactory(JsonApiModule.injectSymbol);
  bind(OperationsModule.injectSymbol).to(OperationsModule);
  bind(ProjectModule.injectSymbol).to(ProjectModule).inSingletonScope();
  bind(ScreenshotModule.injectSymbol).to(ScreenshotModule).inSingletonScope();
  bind(StatusModule.injectSymbol).to(StatusModule);
  bind(SystemHookModule.injectSymbol).to(SystemHookModule);
  bind(UserModule.injectSymbol).to(UserModule);

  // Bindings for hapi plugins
  bind(DeploymentHapiPlugin.injectSymbol).to(DeploymentHapiPlugin);
  bind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin).inSingletonScope();
  bind(OperationsHapiPlugin.injectSymbol).to(OperationsHapiPlugin);
  bind(ProjectHapiPlugin.injectSymbol).to(ProjectHapiPlugin);
  bind(ScreenshotHapiPlugin.injectSymbol).to(ScreenshotHapiPlugin);
  bind(StatusHapiPlugin.injectSymbol).to(StatusHapiPlugin);
  bind(RealtimeHapiPlugin.injectSymbol).to(RealtimeHapiPlugin);

  // Other bindings
  bind(eventBusInjectSymbol).to(PersistentEventBus).inSingletonScope();
  bind(CIProxy.injectSymbol).to(CIProxy);
  bind(GitlabClient.injectSymbol).to(GitlabClient).inSingletonScope();
  bind(fetchInjectSymbol).toConstantValue(fetch);
  bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();
  bind(RemoteScreenshotter.injectSymbol).to(RemoteScreenshotter).inSingletonScope();
  bind(Migrations.injectSymbol).to(Migrations);

  bind(screenshotterInjectSymbol).to(RemoteScreenshotter);

});
