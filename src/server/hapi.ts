export * from 'hapi';
import { ReplyNoContinue, Request, RoutePublicInterface, Server, ServerOptions } from 'hapi';
import { RequestCredentials } from '../authentication';
import { HapiRegister } from './hapi-register';

interface PluginConfig {
  register: HapiRegister;
  options?: any;
  once?: any;
  routes?: any;
  select?: any;
}

declare module 'hapi' {
  interface RouteHandlerPlugins {
    async?: AsyncHandler;
  }
  interface RequestDecorators {
    userHasAccessToProject: (projectId: number) => Promise<boolean>;
    userHasAccessToTeam: (teamId: number) => Promise<boolean>;
    userHasAccessToDeployment: (
      projectId: number,
      deploymentId: number,
      credentials?: RequestCredentials,
    ) => Promise<boolean>;
    isOpenDeployment: (projectId: number, deploymentId: number) => Promise<boolean>;
    getProjectTeam: (projectId: number) => Promise<{id: number, name: string}>;
    isInternal: boolean;
  }
  interface Request extends RequestDecorators {
  }
  // interface RoutePayloadConfigurationObject {
  //   payload?: {
  //     output?: PayLoadOutputOption;
  //     parse: 'gunzip' | boolean;
  //   };
  // }
}

type AsyncHandler = (request: Request, reply: ReplyNoContinue ) => Promise<any>;

function asyncHandlerFactory(_route: RoutePublicInterface, asyncHandler: AsyncHandler) {
  if (typeof asyncHandler !== 'function') {
    throw new Error('Hapi: route handler should be a function');
  }
  return function (request: Request, reply: ReplyNoContinue) { // tslint:disable-line
    asyncHandler.call(this, request, reply)
      .catch((err: any) => reply(err));
  };
}

export function getServer(options?: ServerOptions) {
  const server = new Server(options);
  server.handler('async', asyncHandlerFactory);
  return server;
}

export async function getTestServer(initialize: boolean, ...plugins: PluginConfig[]) {
    const server = getServer({
      debug: {
        log: false,
        request: false,
      } as any,
    });
    // A connection needs to be defined at least for authentication
    server.connection({
      port: 65551,
      routes: {
        cors: true,
      },
    });
    await server.register(plugins);
    if (initialize) {
      await server.initialize();
    }
    return server;
}
