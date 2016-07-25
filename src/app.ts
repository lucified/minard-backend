
// polyfill
require('isomorphic-fetch');
import 'reflect-metadata';

// TODO: find out why we cannot find use from ./server
import { start as startServer } from './server/server';

async function startApp() {
  await startServer();
}

startApp().then(() => {
  console.log('App started');
}).catch((err) => {
  console.log('Error starting application');
  console.log(err);
});
