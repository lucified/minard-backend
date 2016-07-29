
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';

import { HapiRegister } from '../server/hapi-register';
import DeploymentModule, { DeploymentKey, getDeploymentKey, isRawDeploymentHostname} from './deployment-module';

import { gitlabHostInjectSymbol } from '../shared/gitlab-client';

import * as events from 'events';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';

const directoryHandler = require('inert/lib/directory').handler;

@injectable()
class DeploymentHapiPlugin {

  public static injectSymbol = Symbol('deployment-hapi-plugin');

  private deploymentModule: DeploymentModule;
  private gitlabHost: string;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(gitlabHostInjectSymbol) gitlabHost: string ) {

    this.deploymentModule = deploymentModule;
    this.gitlabHost = gitlabHost;

    this.register.attributes = {
      name: 'deployment-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {

    server.ext('onRequest', function (request, reply) {
      if (isRawDeploymentHostname(request.info.hostname)) {
        // prefix the url with /raw-deployment-handler
        // to allow hapi to internally route the request to
        // the correct handler
        request.setUrl('/raw-deployment-handler' + request.url.href);
      }
      return reply.continue();
    });

    server.route({
      method: 'GET',
      path: '/deployments/{projectId}',
      handler: {
        async: this.deploymentsHandler.bind(this),
      },
    });

    server.route({
      method: 'GET',
      path: '/raw-deployment-handler/{param*}',
      handler: {
        async: this.rawDeploymentHandler.bind(this),
      },
    });

    server.route({
      method: '*',
      path: '/ci/api/v1/{what}/{id}/{action?}',
      handler: this.proxyCI.bind(this),
      config: {
        payload: {
          output: 'stream',
          parse: false,
        },
      },
    });

    next();
  };

  public async rawDeploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const key = getDeploymentKey(request.info.hostname) as DeploymentKey;
    const projectId = key.projectId;
    const deploymentId = key.deploymentId;

    if (!key) {
      return reply({
        status: 403,
        message: `Could not parse deployment URL from hostname '${request.info.hostname}'`});
    }

    const isReady = this.deploymentModule.isDeploymentReadyToServe(projectId, deploymentId);
    if (!isReady) {
      try {
        await this.deploymentModule.prepareDeploymentForServing(projectId, deploymentId);
        console.log(`Prepared deployment for serving (projectId: ${projectId}, deploymentId: ${deploymentId})`);
    } catch (err) {
       return reply({ status: 404, message: err.message }).code(404);
      }
    }
    // for now we only support projects that create the artifact in 'dist' folder
    const distPath = path.join(this.deploymentModule
      .getDeploymentPath(projectId, deploymentId), 'dist');
    const dirHandlerOptions = {
      path: distPath,
      listing: true,
    };
    const dirHandler = directoryHandler(request.route, dirHandlerOptions);
    return dirHandler(request, reply);
  }

  public async deploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const params = <any> request.params;
    const projectId = params.projectId;
    return reply(this.deploymentModule.jsonApiGetDeployments(projectId));
  }

  public isJson(headers: Hapi.IDictionary<string>) {
    return headers
      && headers['content-type']
      && headers['content-type'].indexOf('json') >= 0;
  }

  public interceptRunnerRequest(request: Hapi.Request, _response?: http.IncomingMessage): void {

    if (request.method !== 'put' || !this.isJson(request.headers)) {
      return;
    }
    this.collectStream(request.payload)
      .then((payload) => {
        const p = JSON.parse(payload);
        const idKey = 'id';
        if (p && p.state && request.params[idKey]) {
          const id = parseInt(request.params[idKey], 10);
          this.deploymentModule.setDeploymentState(id, p.state);
        }
      });
  }

  public proxyCI(request: Hapi.Request, reply: Hapi.IReply) {

    const gitlab = url.parse(this.gitlabHost);
    const upstream = {
      host: gitlab.hostname,
      port: gitlab.port ? parseInt(gitlab.port, 10) : 80,
      protocol: gitlab.protocol,
    };

    this.interceptRunnerRequest(request);

    return reply.proxy({
      host: upstream.host,
      port: upstream.port,
      protocol: upstream.protocol,
      passThrough: true,
      onResponse: this.onResponse.bind(this),
    });
  }

  public onResponse(
    err: any,
    response: http.IncomingMessage,
    request: Hapi.Request,
    reply: Hapi.IReply,
    _settings: Hapi.IProxyHandlerConfig,
    _ttl: any) {
    if (err) {
      console.error(err);
      reply(response);
      return;
    }
    if (this.isJson(response.headers as Hapi.IDictionary<string>)) {
      const whatKey = 'what';
      if (response.statusCode === 201 && request.params[whatKey] === 'builds') {
        this.collectStream(response)
          .then(payload => {
            const p = JSON.parse(payload);
            // console.log(p);
            const r = reply(payload).charset('');
            this.deploymentModule.setDeploymentState(parseInt(p.id, 10), p.status, parseInt(p.project_id, 10));
            r.headers = response.headers;
            r.statusCode = response.statusCode ? response.statusCode : 200;
          });

      } else {
        reply(response).charset('');
      }
    } else {
      reply(response);
    }
  }

  public collectStream(s: events.EventEmitter): Promise<string> {

    const body: Buffer[] = [];
    return new Promise((resolve, reject) => {
        s.on('error', (err: any) => {
          reject(err);
        }).on('data', (chunk: Buffer) => {
          body.push(chunk);
        }).on('end', () => {
          resolve(Buffer.concat(body).toString());
        });
    });

  }
}

export default DeploymentHapiPlugin;
