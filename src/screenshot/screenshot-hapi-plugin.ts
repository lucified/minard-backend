import { notFound } from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';

import * as Hapi from '../server/hapi';
import { HapiRegister } from '../server/hapi-register';
import ScreenshotModule from './screenshot-module';

@injectable()
export default class ScreenshotHapiPlugin {
  public static injectSymbol = Symbol('screenshot-hapi-plugin');

  constructor(
    @inject(ScreenshotModule.injectSymbol)
    private screenshotModule: ScreenshotModule,
  ) {
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
  };

  public async screenshotHandler(
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const projectId = (request.params as any).projectId;
    const deploymentId = (request.params as any).deploymentId;
    const token = (request.query as any).token;
    if (
      !this.screenshotModule.deploymentHasScreenshot(projectId, deploymentId)
    ) {
      throw notFound();
    }
    if (!this.screenshotModule.isValidToken(projectId, deploymentId, token)) {
      throw notFound();
    }
    const path = this.screenshotModule.getScreenshotPath(
      projectId,
      deploymentId,
    );
    return reply.file(path, { confine: false } as any);
  }
}
