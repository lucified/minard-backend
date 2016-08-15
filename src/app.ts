
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { Kernel } from 'inversify';

// Imports below should be in alphabetical order, based
// on the last part of the import path.

import { ActivityModule } from './activity';
import { AuthenticationModule } from './authentication';

import {
  developmentConfig,
  getOverrideConfig,
  productionConfig,
} from './config';

import {
  CIProxy,
  DeploymentHapiPlugin,
  DeploymentModule,
} from './deployment';

import {
  LocalEventBus,
  eventBusInjectSymbol,
} from './event-bus';

import {
  GitlabClient,
  fetchInjectSymbol,
} from './shared/gitlab-client';

import {
  JsonApiHapiPlugin,
  JsonApiModule,
  MemoizedJsonApiModule,
} from './json-api';

import {
  Logger,
  loggerInjectSymbol,
} from './shared/logger';

import {
  ProjectHapiPlugin,
  ProjectModule,
} from './project';

import { MinardServer } from './server';

import {
  StatusHapiPlugin,
  StatusModule,
} from './status';

import { SystemHookModule } from './system-hook';
import { UserModule } from './user';

const kernel = new Kernel();

// Notes on injecting EventBus:
//
// We are binding the eventBus as a constantValue as the
// normal injection mechanism does not work when the base class
// does not have the @injectable() annotation, and the base class
// in RxJx, which means we cannot modify it.
//
// This is not a problem as long as we don't need to inject other
// dependencies into EventBus
//
//  -- JO 25.6.2016

// Bindings for modules
kernel.bind(ActivityModule.injectSymbol).to(ActivityModule);
kernel.bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);
kernel.bind(DeploymentModule.injectSymbol).to(DeploymentModule).inSingletonScope();
kernel.bind(JsonApiModule.injectSymbol).to(MemoizedJsonApiModule);
kernel.bind(JsonApiModule.factoryInjectSymbol).toAutoFactory(JsonApiModule.injectSymbol);
kernel.bind(ProjectModule.injectSymbol).to(ProjectModule).inSingletonScope();
kernel.bind(StatusModule.injectSymbol).to(StatusModule);
kernel.bind(SystemHookModule.injectSymbol).to(SystemHookModule);
kernel.bind(UserModule.injectSymbol).to(UserModule);

// Bindings for hapi plugins
kernel.bind(DeploymentHapiPlugin.injectSymbol).to(DeploymentHapiPlugin);
kernel.bind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin).inSingletonScope();
kernel.bind(ProjectHapiPlugin.injectSymbol).to(ProjectHapiPlugin);
kernel.bind(StatusHapiPlugin.injectSymbol).to(StatusHapiPlugin);

// Other bindings
kernel.bind(eventBusInjectSymbol).toConstantValue(new LocalEventBus());
kernel.bind(CIProxy.injectSymbol).to(CIProxy);
kernel.bind(GitlabClient.injectSymbol).to(GitlabClient).inSingletonScope();
kernel.bind(fetchInjectSymbol).toConstantValue(fetch);
kernel.bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();

// Load bindings that represent configuration
const env = process.env.NODE_ENV || 'development';
const overrideConfig = getOverrideConfig();
if (overrideConfig != null) {
  console.log('Using override config');
  overrideConfig(kernel);
} else if (env === 'production') {
  productionConfig(kernel);
} else {
  developmentConfig(kernel);
}

const server = kernel.get<MinardServer>(MinardServer.injectSymbol);
const logger = kernel.get<Logger>(loggerInjectSymbol);

server.start().then(() => {
  logger.info('Started charles');
}).catch((err) => {
  logger.warn('Error starting charles');
});
