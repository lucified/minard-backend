
import * as Hapi from 'hapi';
require('isomorphic-fetch');

const server = new Hapi.Server();


const args = process.argv.slice(2); // drop binary and filename

server.connection({
    host: args[0] || '0.0.0.0',
    port: args[1] ? parseInt(args[1], 10) : 8000,
});

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
    // http://stackoverflow.com/questions/33387090/how-to-rewrite-code-to-avoid-tslint-object-access-via-string-literals
    const nameKey = 'name';
    return reply('hello ' + request.params[nameKey]);
  },
});

async function fetchSomething() {
  const response = await fetch('http://localhost:8001/something.json');
  const json = response.json();
  return json;
}

async function fetchSomethingHandler(_request: any, reply: any) {
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
    },
  });

  server.start((err) => {
    if (err) { throw err; }
    console.log('Server running at:', server.info.uri);
  });
});
