
import * as Hapi from 'hapi';
const hapiAsyncHandler = require('hapi-async-handler');

import HelloPlugin from '../hello/hello-hapi-plugin';

async function loadBasePlugins(server: Hapi.Server) {
  await server.register(hapiAsyncHandler);
};

async function loadAppPlugins(server: Hapi.Server) {
  await server.register([HelloPlugin]);
}

export async function start(): Promise<Hapi.Server> {

  const options = {
    debug: {
      log: ['error'],
      request: ['error']
    },
  };

  const server = new Hapi.Server(options);
  const args = process.argv.slice(2); // drop binary and filename
  server.connection({
    host: args[0] || '0.0.0.0',
    port: args[1] ? parseInt(args[1], 10) : 8000,
    routes: {
        json: {
          space: 4,
        },
    },
  });

  await loadBasePlugins(server);
  await loadAppPlugins(server);
  await server.start();

  console.log('Server running at:', server.info.uri);
  return server;
};


