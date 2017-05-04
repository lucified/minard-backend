import { Observable } from '@reactivex/rxjs';
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as Joi from 'joi';
import * as moment from 'moment';

import { STRATEGY_TOPLEVEL_USER_URL } from '../authentication';
import {
  COMMENT_ADDED_EVENT_TYPE,
  COMMENT_DELETED_EVENT_TYPE,
} from '../comment';
import * as Hapi from '../server/hapi';
import { HapiPlugin } from '../server/hapi-register';
import { PersistedEvent } from '../shared/events';
import * as logger from '../shared/logger';
import { ObservableWrapper } from './observable-wrapper';
import { RealtimeModule } from './realtime-module';

export const PING_INTERVAL = 20000;

type Predicate = (event: PersistedEvent<any>) => boolean;

@injectable()
export class RealtimeHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');

  constructor(
    @inject(RealtimeModule.injectSymbol) private readonly realtimeModule: RealtimeModule,
    @inject(logger.loggerInjectSymbol) private readonly logger: logger.Logger,
  ) {
    super({
      name: 'realtime-plugin',
      version: '1.0.0',
    });
  }

  public register(server: Hapi.Server, _options: Hapi.IServerOptions, next: () => void) {

    server.route([{
      method: 'GET',
      path: '/events/{teamId}',
      handler: {
        async: this.teamHandler,
      },
      config: {
        bind: this,
        auth: STRATEGY_TOPLEVEL_USER_URL,
        validate: {
          params: {
            teamId: Joi.number().required(),
          },
        },
      },
    }, {
      method: 'GET',
      path: '/events/deployment/{projectId}-{deploymentId}',
      handler: {
        async: this.deploymentHandler,
      },
      config: {
        bind: this,
        auth: {
          mode: 'try',
          strategies: [STRATEGY_TOPLEVEL_USER_URL],
        },
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
          },
        },
      },
    }]);
    next();
  }

  public async getStream(teamId: number, predicate: Predicate, lastEventId?: number) {
    const stream = Observable.concat(
      lastEventId ?
        await this.realtimeModule.getExistingEvents(teamId, lastEventId) :
        Observable.empty<PersistedEvent<any>>(),
      this.realtimeModule.getSSEStream(),
    );
    return Observable.concat(
      Observable.of(pingEventCreator()),
      Observable.merge(
        Observable.interval(PING_INTERVAL).map(_ => pingEventCreator()),
        stream.filter(predicate),
      ),
    );
  }

  private async streamReply(stream: Observable<PersistedEvent<any>>, request: Hapi.Request, reply: Hapi.IReply) {
    const nodeStream = new ObservableWrapper(stream);
    reply(nodeStream)
      .header('content-type', 'text/event-stream')
      .header('content-encoding', 'identity');

    request.once('disconnect', () => {
      // Clean up on disconnect
      nodeStream.push(null);
    });
  }

  private async teamHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const { teamId } = request.params;
      const _teamId = parseInt(teamId, 10);
      const predicate = (event: PersistedEvent<any>) => event.teamId === _teamId;
      const stream = await this.getStream(_teamId, predicate, getLastEventId(request));
      return this.streamReply(stream, request, reply);
    } catch (err) {
      this.logger.warn('Problems handling a SSE request', err);
      return reply(Boom.wrap(err));
    }
  }

  private async deploymentHandler(request: Hapi.Request, reply: Hapi.IReply) {
    try {
      const projectId = parseInt(request.params.projectId, 10);
      const deploymentId = parseInt(request.params.deploymentId, 10);
      let teamId: number | undefined;
      if (await request.userHasAccessToDeployment(projectId, deploymentId, request.auth.credentials)) {
        teamId = (await request.getProjectTeam(projectId)).id;
      }
      if (teamId) {
        const predicate = deploymentEventFilter(teamId, projectId, deploymentId);
        const stream = await this.getStream(teamId, predicate, getLastEventId(request));
        return this.streamReply(stream, request, reply);
      }
    } catch (err) {
      this.logger.warn('Problems handling a SSE request', err);
      return reply(Boom.wrap(err));
    }
    return reply(Boom.notFound());
  }

}

export function pingEventCreator(): PersistedEvent<any> {
  return {
    type: 'CONTROL_PING',
    id: '0',
    streamRevision: 0,
    teamId: 0,
    created: moment(),
    payload: 0,
  };
}

export function deploymentEventFilter(teamId: number, projectId: number, deploymentId: number) {
  return (event: PersistedEvent<any>) => {
    switch (event.type.replace(/^SSE_/, '')) {
      case COMMENT_ADDED_EVENT_TYPE:
        return event.teamId === teamId &&
          event.payload.attributes.deployment === `${projectId}-${deploymentId}`;
      case COMMENT_DELETED_EVENT_TYPE:
        return event.teamId === teamId &&
          event.payload.deployment === `${projectId}-${deploymentId}`;
    }
    return false;
  };
}

export function getLastEventId(request: Hapi.Request) {
  const since = parseInt(request.headers['last-event-id'], 10);
  if (since && !isNaN(since)) {
    return since;
  }
  return undefined;
}
