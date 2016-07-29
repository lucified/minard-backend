
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { Kernel } from 'inversify';
import * as Knex from 'knex';

import AuthenticationModule from './authentication/authentication-module';

import DeploymentPlugin from './deployment/deployment-hapi-plugin';
import { default as DeploymentModule, deploymentFolderInjectSymbol } from './deployment/deployment-module';

import ProjectPlugin from './project/project-hapi-plugin';
import ProjectModule from './project/project-module';

import { default as SystemHookModule, systemHookBaseUrlSymbol } from './system-hook/system-hook-module';

import HelloPlugin from './hello/hello-hapi-plugin';

import UserModule from './user/user-module';

import { EventBus } from './event-bus/event-bus';
import LocalEventBus from './event-bus/local-event-bus';

import MinardServer, {hostInjectSymbol, portInjectSymbol} from './server/server';

import { GitlabClient, fetchInjectSymbol, gitlabHostInjectSymbol } from './shared/gitlab-client';

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

kernel.bind(GitlabClient.injectSymbol).to(GitlabClient).inSingletonScope();
kernel.bind(ProjectModule.injectSymbol).to(ProjectModule);
kernel.bind(ProjectPlugin.injectSymbol).to(ProjectPlugin);
kernel.bind(SystemHookModule.injectSymbol).to(SystemHookModule);
kernel.bind(AuthenticationModule.injectSymbol).to(AuthenticationModule);

const HOST = process.env.HOST ? process.env.HOST : '0.0.0.0';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const GITLAB_HOST = process.env.GITLAB_HOST ? process.env.GITLAB_HOST : 'localhost';
const GITLAB_PORT = process.env.GITLAB_PORT ? parseInt(process.env.GITLAB_PORT, 10) : 10080;
const DEPLOYMENT_FOLDER = process.env.DEPLOYMENT_FOLDER ? process.env.DEPLOYMENT_FOLDER : 'gitlab-data/monolith/';
const SYSTEMHOOK_BASEURL = process.env.SYSTEMHOOK_BASEURL ? process.env.SYSTEMHOOK_BASEURL : `http://monolith:${PORT}`;
const DB_ADAPTER = process.env.DB_ADAPTER ? process.env.DB_ADAPTER : 'postgresql';
const DB_HOST = process.env.DB_HOST ? process.env.DB_HOST : 'localhost';
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
const DB_USER = process.env.DB_USER ? process.env.DB_USER : 'gitlab';
const DB_PASS = process.env.DB_PASS ? process.env.DB_PASS : 'password';
const DB_NAME = process.env.DB_NAME ? process.env.DB_NAME : 'gitlabhq_production';

kernel.bind(hostInjectSymbol).toConstantValue(HOST);
kernel.bind(portInjectSymbol).toConstantValue(PORT);

kernel.bind(gitlabHostInjectSymbol).toConstantValue(`http://${GITLAB_HOST}:${GITLAB_PORT}`);
kernel.bind(fetchInjectSymbol).toConstantValue(fetch);
kernel.bind(systemHookBaseUrlSymbol).toConstantValue(SYSTEMHOOK_BASEURL);
kernel.bind(deploymentFolderInjectSymbol).toConstantValue(DEPLOYMENT_FOLDER);

const knex = Knex({
  client: DB_ADAPTER,
  connection: {
    host     : DB_HOST,
    user     : DB_USER,
    password : DB_PASS,
    database : DB_NAME,
    port: DB_PORT,
  },
});
kernel.bind('gitlab-knex').toConstantValue(knex);

const server = kernel.get<MinardServer>(MinardServer.injectSymbol);

server.start().then(() => {
  console.log('App started');
}).catch((err) => {
  console.log('Error starting application');
  console.log(err);
});
