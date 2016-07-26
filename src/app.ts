

// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { Kernel } from 'inversify';
import * as Knex from 'knex';

import AuthenticationModule from './authentication/authentication-module';

import DeploymentPlugin from './deployment/deployment-hapi-plugin';
import DeploymentModule from './deployment/deployment-module';

import ProjectPlugin from './project/project-hapi-plugin';
import ProjectModule from './project/project-module';

import SystemHookModule from './system-hook/system-hook-module';

import HelloPlugin from './hello/hello-hapi-plugin';

import UserModule from './user/user-module';

import { EventBus } from './event-bus/event-bus';
import LocalEventBus from './event-bus/local-event-bus';

import MinardServer from './server/server';

import { GitlabClient, fetchInjectSymbol, gitlabHostInjectSymbol } from './shared/gitlab-client'

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
kernel.bind(EventBus.injectSymbol).toConstantValue(new LocalEventBus());
kernel.bind(DeploymentPlugin.injectSymbol).to(DeploymentPlugin);
kernel.bind(DeploymentModule.injectSymbol).to(DeploymentModule);
kernel.bind(HelloPlugin.injectSymbol).to(HelloPlugin);
kernel.bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();
kernel.bind(UserModule.injectSymbol).to(UserModule);
kernel.bind(GitlabClient.injectSymbol).to(GitlabClient);
kernel.bind(ProjectModule.injectSymbol).to(ProjectModule);
kernel.bind(ProjectPlugin.injectSymbol).to(ProjectPlugin);
kernel.bind(SystemHookModule.injectSymbol).to(SystemHookModule);
kernel.bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);

kernel.bind(gitlabHostInjectSymbol).toConstantValue('http://localhost:10080');
kernel.bind(fetchInjectSymbol).toConstantValue(fetch);
kernel.bind('internal-server-url').toConstantValue('http://localhost:8000');

const knex = Knex({
  client: 'postgresql',
  connection: {
    host     : 'localhost',
    user     : 'gitlab',
    password : 'password',
    database : 'gitlabhq_production',
    port: '5432',
  },
});
kernel.bind('gitlab-knex').toConstantValue(knex);

const server = kernel.get<MinardServer>(MinardServer.injectSymbol);

async function startApp() {
  await server.start();
}

startApp().then(() => {
  console.log('App started');
}).catch((err) => {
  console.log('Error starting application');
  console.log(err);
});
