
import * as Boom from 'boom';
import * as Hapi from 'hapi';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import { HapiRegister } from '../server/hapi-register';
import ScreenshotModule from './screenshot-module';

@injectable()
export default class ScreenshotHapiPlugin {

  public static injectSymbol = Symbol('screenshot-hapi-plugin');

  private screenshotModule: ScreenshotModule;

  constructor(
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule) {
    this.screenshotModule = screenshotModule;
    this.register.attributes = {
      name: 'screenshot-plugin',
      version: '1.0.0',
    };
  }

  public register: HapiRegister = (server, _options, next) => {
    server.route({
      method: 'GET',
      path: '/{projectId}/{deploymentId}',
      handler: {
        async: this.screenshotHandler.bind(this),
      },
      config: {
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    });
    next();
  };

  public async screenshotHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    const deploymentId = (<any> request.params).deploymentId;
    if (!this.screenshotModule.deploymentHasScreenshot(projectId, deploymentId)) {
      throw Boom.notFound();
    }
    const path = this.screenshotModule.getScreenshotPath(projectId, deploymentId);
    return reply.file(path, {confine: false} as any);
  }

}
