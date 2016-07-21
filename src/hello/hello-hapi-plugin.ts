
import { HapiRegister } from '../server/hapi-register';
import { fetchSomethingHandler } from './hello-module';

const register: HapiRegister = (server, _options, next) => {

  server.route({
    method: 'GET',
    path: '/',
    handler: (_request, reply) => {
      return reply('jepa joo');
    },
  });

  server.route({
    method: 'GET',
    path: '/hello/{name}',
    handler: (request, reply) => {
      const nameKey = 'name';
      return reply('hello ' + request.params[nameKey]);
    },
  });

  server.route({
    method: 'GET',
    path: '/fetch-test',
    handler: {
      async: fetchSomethingHandler,
    },
  });

  next();
};

register.attributes = {
  name: 'hello-plugin',
  version: '1.0.0',
};

export default register;

