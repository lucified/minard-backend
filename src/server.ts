
import * as Hapi from 'hapi';
require('isomorphic-fetch');

const server = new Hapi.Server();

declare module "hapi" {

    interface AsyncRouteConfiguration extends IRouteConfiguration {
      handler: { async: any };
    }

    interface Server {
      route(options: AsyncRouteConfiguration): void;
    }
}

server.connection({
    host: '0.0.0.0',
    port: 8000
});

server.route({
  method: 'GET',
  path: '/',
  handler: (request, reply) => {
    return reply('jepa joo');
  },
})

server.route({
  method: 'GET',
  path: '/hello/{name}',
  handler: (request, reply) => {
    return reply('hello ' + request.params['name']);
  }
});

async function fetchSomething() {
  const response = await fetch('http://localhost:8001/something.json');
  const json = response.json();
  return json;
}

async function fetchSomethingHandler(request, reply) {
  const something = await fetchSomething();
  return reply(something);
}

server.register([
  require('hapi-async-handler'),
], (error) => {
  if (error) {
    throw error;
  }
  server.route({
    method: 'GET',
    path: '/fetch-test',
    handler: {
      async: fetchSomethingHandler,
    }
  });

  server.start((err) => {
    if (err) { throw err; }
    console.log('Server running at:', server.info.uri);
  });
});







