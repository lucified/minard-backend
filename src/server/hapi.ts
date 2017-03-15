export * from 'hapi';
import { IReply, IRoute, IServerOptions, Request, Server } from 'hapi';
import { HapiRegister } from './hapi-register';

interface PluginConfig {
  register: HapiRegister;
  options?: any;
  once?: any;
  routes?: any;
  select?: any;
}

declare module 'hapi' {
  interface IRouteHandlerConfig {
    async?: AsyncHandler;
  }
  interface ICookieSettings {
    isSameSite: false | 'Strict' | 'Lax';
  }
  interface Request {
    userHasAccessToProject: (projectId: number) => Promise<boolean>;
    userHasAccessToTeam: (teamId: number) => Promise<boolean>;
  }
}

type AsyncHandler = (request: Request, reply: IReply ) => Promise<any>;

function asyncHandlerFactory(_route: IRoute, asyncHandler: AsyncHandler) {
  if (typeof asyncHandler !== 'function') {
    throw new Error('Hapi: route handler should be a function');
  }
  return function (request: Request, reply: IReply) { // tslint:disable-line
    asyncHandler.call(this, request, reply)
      .catch((err: any) => reply(err));
  };
}

export function getServer(options?: IServerOptions) {
  const server = new Server(options);
  server.handler('async', asyncHandlerFactory);
  return server;
}

export async function getTestServer(...plugins: PluginConfig[]) {
    const server = getServer({
      debug: {
        log: false,
        request: false,
      } as any,
    });
    // A connection needs to be defined at least for authentication
    server.connection({
      port: 65551,
    });
    await server.register(plugins);
    await server.initialize();
    return server;
}
