import { ContainerModule } from 'inversify';

// Imports below should be in alphabetical order, based
// on the last part of the import path.

import { ActivityModule } from '../activity';
import {
  AuthenticationHapiPlugin,
  AuthenticationModule,
} from '../authentication';

import {
  CommentModule,
} from '../comment';

import {
  CIProxy,
  DeploymentHapiPlugin,
  DeploymentModule,
} from '../deployment';

import {
  Route53Updater,
} from '../shared/route53-updater';

import {
  eventBusInjectSymbol,
  PersistentEventBus,
} from '../event-bus';

import {
  GitlabClient,
} from '../shared/gitlab-client';

import {
  fetchInjectSymbol,
} from '../shared/types';

import {
  fetch,
} from '../shared/fetch';

import TokenGenerator from '../shared/token-generator';

import {
  JsonApiHapiPlugin,
  JsonApiModule,
  ViewEndpoints,
} from '../json-api';

import Migrations from '../migrations';

import {
  OperationsHapiPlugin,
  OperationsModule,
} from '../operations';

import {
  CachedProjectModule,
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

import {
  FlowdockNotify,
  HipchatNotify,
  NotificationModule,
} from '../notification';

import { SystemHookModule } from '../system-hook';
import { UserModule } from '../user';

export default new ContainerModule((bind, _unbind, _isBound, _rebind) => {

  // Bindings for modules
  bind(ActivityModule.injectSymbol).to(ActivityModule).inSingletonScope();
  bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);
  bind(CommentModule.injectSymbol).to(CommentModule);
  bind(DeploymentModule.injectSymbol).to(DeploymentModule).inSingletonScope();
  bind(JsonApiModule.injectSymbol).to(JsonApiModule);
  bind(NotificationModule.injectSymbol).to(NotificationModule).inSingletonScope();
  bind(OperationsModule.injectSymbol).to(OperationsModule);
  bind(ProjectModule.injectSymbol).to(CachedProjectModule).inSingletonScope();
  bind(ScreenshotModule.injectSymbol).to(ScreenshotModule).inSingletonScope();
  bind(StatusModule.injectSymbol).to(StatusModule);
  bind(SystemHookModule.injectSymbol).to(SystemHookModule);
  bind(UserModule.injectSymbol).to(UserModule);
  bind(ViewEndpoints.injectSymbol).to(ViewEndpoints);

  // Bindings for hapi plugins
  bind(DeploymentHapiPlugin.injectSymbol).to(DeploymentHapiPlugin);
  bind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin).inSingletonScope();
  bind(OperationsHapiPlugin.injectSymbol).to(OperationsHapiPlugin);
  bind(ProjectHapiPlugin.injectSymbol).to(ProjectHapiPlugin).inSingletonScope();
  bind(ScreenshotHapiPlugin.injectSymbol).to(ScreenshotHapiPlugin);
  bind(StatusHapiPlugin.injectSymbol).to(StatusHapiPlugin);
  bind(RealtimeHapiPlugin.injectSymbol).to(RealtimeHapiPlugin);
  bind(AuthenticationHapiPlugin.injectSymbol).to(AuthenticationHapiPlugin);

  // Other bindings
  bind(eventBusInjectSymbol).to(PersistentEventBus).inSingletonScope();
  bind(CIProxy.injectSymbol).to(CIProxy);
  bind(GitlabClient.injectSymbol).to(GitlabClient).inSingletonScope();
  bind(fetchInjectSymbol).toConstantValue(fetch);
  bind(FlowdockNotify.injectSymbol).to(FlowdockNotify);
  bind(HipchatNotify.injectSymbol).to(HipchatNotify);
  bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();
  bind(RemoteScreenshotter.injectSymbol).to(RemoteScreenshotter).inSingletonScope();
  bind(Migrations.injectSymbol).to(Migrations);
  bind(screenshotterInjectSymbol).to(RemoteScreenshotter);
  bind(Route53Updater.injectSymbol).to(Route53Updater);
  bind(TokenGenerator.injectSymbol).to(TokenGenerator);
});
