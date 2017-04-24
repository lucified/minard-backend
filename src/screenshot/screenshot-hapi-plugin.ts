import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import * as Hapi from '../server/hapi';
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
        async: this.screenshotHandler,
      },
      config: {
        bind: this,
        cors: true,
        auth: false,
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
          query: {
            token: Joi.string().alphanum().required(),
          },
        },
      },
    });
    next();
  }

  public async screenshotHandler(request: Hapi.Request, reply: Hapi.IReply) {
    const projectId = (<any> request.params).projectId;
    const deploymentId = (<any> request.params).deploymentId;
    const token = (<any> request.query).token;
    if (!this.screenshotModule.deploymentHasScreenshot(projectId, deploymentId)) {
      throw Boom.notFound();
    }
    if (!this.screenshotModule.isValidToken(projectId, deploymentId, token)) {
      throw Boom.forbidden('Invalid token');
    }
    const path = this.screenshotModule.getScreenshotPath(projectId, deploymentId);
    return reply.file(path, {confine: false} as any);
  }

}
