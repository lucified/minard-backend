
import { inject, injectable } from 'inversify';

import { EventBus } from '../event-bus/event-bus';
import { HapiRegister } from '../server/hapi-register';
import { fetchSomethingHandler } from './hello-module';

@injectable()
class HelloHapiPlugin {

  public static injectSymbol = Symbol('hello-hapi-plugin');
  private eventBus: EventBus;

  constructor(@inject(EventBus.injectSymbol) eventBus: EventBus) {
    this.eventBus = eventBus;
    this.register.attributes = {
      name: 'hello-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {

    this.eventBus.subscribe(event => {
      console.log(event);
    });

    server.route({
      method: 'GET',
      path: '/',
      handler: (_request, reply) => {
        this.eventBus.post({ type: 'hello' });
        return reply('hello');
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

}

export default HelloHapiPlugin;

