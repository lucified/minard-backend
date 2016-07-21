
import * as Hapi from 'hapi';

declare module 'hapi' {

    interface AsyncRouteConfiguration extends IRouteConfiguration {
      handler: { async: any };
    }

    interface Server {
      route(options: AsyncRouteConfiguration): void;
    }
}

export default Hapi;
