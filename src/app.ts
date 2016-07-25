
// polyfills
require('isomorphic-fetch');
import 'reflect-metadata';

import { Kernel } from 'inversify';

import { EventBus } from './event-bus/event-bus';
import LocalEventBus from './event-bus/local-event-bus';
import HelloPlugin from './hello/hello-hapi-plugin';
import MinardServer from './server/server';

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

kernel.bind(HelloPlugin.injectSymbol).to(HelloPlugin).inSingletonScope();
kernel.bind(MinardServer.injectSymbol).to(MinardServer).inSingletonScope();

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
