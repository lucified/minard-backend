
import * as Hapi from 'hapi';

import { HapiRegister } from '../server/hapi-register';
import { handleGetDeployments } from './deployment-module';


async function getDeploymentsHandler(request: Hapi.Request, reply: Hapi.IReply) {
  const params = <any>request.params;
  const projectId = params.projectId;
  return reply(handleGetDeployments(projectId));
}

const register: HapiRegister = (server, _options, next) => {

  server.route({
    method: 'GET',
    path: '/aaa',
    handler: (_request, reply) => {
      return reply('jepa jooaaaa');
    },
  });

  server.route({
    method: 'GET',
    path: '/deployments/{projectId}',
    handler: {
      async: getDeploymentsHandler,
    },
  });
  next();
};

register.attributes = {
  name: 'deployment-plugin',
  version: '1.0.0',
};

export default register;

