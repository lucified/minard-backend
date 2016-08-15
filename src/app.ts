
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { Kernel } from 'inversify';

import {
  JsonApiHapiPlugin,
  JsonApiModule,
  MemoizedJsonApiModule,
} from './json-api';

import AuthenticationModule from './authentication/authentication-module';
import DeploymentPlugin from './deployment/deployment-hapi-plugin';
import { Logger, loggerInjectSymbol } from './shared/logger';
import { StatusModule } from './status';

import { CIProxy, DeploymentModule } from './deployment';

import { ProjectHapiPlugin, ProjectModule } from './project';

import SystemHookModule from './system-hook/system-hook-module';

import { StatusHapiPlugin } from './status';

import ActivityModule from './activity/activity-module';
import UserModule from './user/user-module';

import { LocalEventBus, injectSymbol as eventBusInjectSymbol } from './event-bus';

import { MinardServer } from './server';

import { GitlabClient, fetchInjectSymbol } from './shared/gitlab-client';

import { developmentConfig, getOverrideConfig, productionConfig } from './config';

const kernel = new Kernel();

// We are injecting the eventBus here as a constantValue as the
// normal injection mechanism does not work when the base class
// does not have the @injectable() annotation, and the base class
// in RxJx, which means we cannot modify it.
//
// This is not a problem as long as we don't need to inject other
// dependencies into EventBus
//
//  -- JO 25.6.2016
kernel.bind(eventBusInjectSymbol).toConstantValue(new LocalEventBus());
kernel.bind(DeploymentPlugin.injectSymbol).to(DeploymentPlugin);
kernel.bind(DeploymentModule.injectSymbol).to(DeploymentModule).inSingletonScope();
kernel.bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();
kernel.bind(UserModule.injectSymbol).to(UserModule);
kernel.bind(CIProxy.injectSymbol).to(CIProxy);
kernel.bind(StatusModule.injectSymbol).to(StatusModule);

kernel.bind(GitlabClient.injectSymbol).to(GitlabClient).inSingletonScope();
kernel.bind(ProjectModule.injectSymbol).to(ProjectModule).inSingletonScope();
kernel.bind(SystemHookModule.injectSymbol).to(SystemHookModule);
kernel.bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);
kernel.bind(ActivityModule.injectSymbol).to(ActivityModule);

kernel.bind(JsonApiHapiPlugin.injectSymbol).to(JsonApiHapiPlugin).inSingletonScope();
kernel.bind(JsonApiModule.injectSymbol).to(MemoizedJsonApiModule);
kernel.bind(JsonApiModule.factoryInjectSymbol).toAutoFactory(JsonApiModule.injectSymbol);
kernel.bind(StatusHapiPlugin.injectSymbol).to(StatusHapiPlugin);
kernel.bind(ProjectHapiPlugin.injectSymbol).to(ProjectHapiPlugin);
kernel.bind(fetchInjectSymbol).toConstantValue(fetch);

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
