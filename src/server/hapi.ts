export * from 'hapi';
import { IReply, IRoute, IServerOptions, Request, Server } from 'hapi';

declare module 'hapi' {
  interface IRouteHandlerConfig {
    async?: AsyncHandler;
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
