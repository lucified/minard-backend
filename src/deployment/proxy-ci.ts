
import * as events from 'events';
import * as Hapi from 'hapi';
import * as http from 'http';
import * as url from 'url';


function isJson(headers: Hapi.IDictionary<string>) {
  return headers && headers['content-type'] && headers['content-type'].indexOf('json') >= 0;
}

export function proxyCI(gitlabHost: string, setStateCallback: () => void, request: Hapi.Request, reply: Hapi.IReply) {
  const gitlab = url.parse(gitlabHost);
  const upstream = {
    host: gitlab.hostname,
    port: gitlab.port ? parseInt(gitlab.port, 10) : 80,
    protocol: gitlab.protocol,
  };
  interceptRunnerRequest(request, setStateCallback);
  return reply.proxy({
    host: upstream.host,
    port: upstream.port,
    protocol: upstream.protocol,
    passThrough: true,
    onResponse: onResponse as any,
  });
}

function onResponse(
  err: any,
  response: http.IncomingMessage,  // note that this is incorrect in the hapi type def
  request: Hapi.Request,
  reply: Hapi.IReply,
  _settings: Hapi.IProxyHandlerConfig,
  _ttl: number) {
  if (err) {
    console.error(err);
    reply(response);
    return;
  }
  if (isJson(response.headers as Hapi.IDictionary<string>)) {
    const whatKey = 'what';
    if (response.statusCode === 201 && request.params[whatKey] === 'builds') {
      this.collectStream(response)
        .then((payload: any) => {
          const p = JSON.parse(payload);
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

function collectStream(s: events.EventEmitter): Promise<string> {
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

function interceptRunnerRequest(
    request: Hapi.Request,
    setStateCallback: (id: number, state: string) => void): void {
  if (request.method !== 'put' || !isJson(request.headers)) {
    return;
  }
  collectStream(request.payload)
    .then((payload: any) => {
      const p = JSON.parse(payload);
      const idKey = 'id';
      if (p && p.state && request.params[idKey]) {
        const id = parseInt(request.params[idKey], 10);
        setStateCallback(id, p.state);
      }
    });
}

