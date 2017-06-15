import { Observable } from '@reactivex/rxjs';
import { forbidden, notFound, wrap } from 'boom';
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
import { Logger, loggerInjectSymbol } from '../shared/logger';
import TokenGenerator from '../shared/token-generator';
import { ObservableWrapper } from './observable-wrapper';
import { RealtimeModule } from './realtime-module';

export const PING_INTERVAL = 20000;

type Predicate = (event: PersistedEvent<any>) => boolean;
const PREKEY = 'pre';

@injectable()
export class RealtimeHapiPlugin extends HapiPlugin {

  public static injectSymbol = Symbol('realtime-plugin');

  constructor(
    @inject(RealtimeModule.injectSymbol) private readonly realtimeModule: RealtimeModule,
    @inject(TokenGenerator.injectSymbol) private readonly tokenGenerator: TokenGenerator,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
  ) {
    super({
      name: 'realtime-plugin',
      version: '1.0.0',
    });
    this.validateDeploymentToken = this.validateDeploymentToken.bind(this);
    this.authorizeDeployment = this.authorizeDeployment.bind(this);
  }

  public register(server: Hapi.Server, _options: Hapi.ServerOptions, next: () => void) {

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
      path: '/events/deployment/{projectId}-{deploymentId}/{token}',
      handler: {
        async: this.deploymentHandler,
      },
      config: {
        bind: this,
        pre: [
          this.validateDeploymentToken,
          {
            method: this.authorizeDeployment,
            assign: PREKEY,
          },
        ],
        auth: {
          mode: 'try',
          strategies: [STRATEGY_TOPLEVEL_USER_URL],
        },
        validate: {
          params: {
            projectId: Joi.number().required(),
            deploymentId: Joi.number().required(),
            token: Joi.string().required(),
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

  private async streamReply(
    stream: Observable<PersistedEvent<any>>,
    request: Hapi.Request,
    reply: Hapi.ReplyNoContinue,
  ) {
    const nodeStream = new ObservableWrapper(stream);
    reply(nodeStream)
      .header('content-type', 'text/event-stream')
      .header('content-encoding', 'identity');

    request.once('disconnect', () => {
      // Clean up on disconnect
      nodeStream.push(null);
    });
  }

  private async teamHandler(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    try {
      const { teamId } = request.params;
      const _teamId = parseInt(teamId, 10);
      const predicate = (event: PersistedEvent<any>) => event.teamId === _teamId;
      const stream = await this.getStream(_teamId, predicate, getLastEventId(request));
      return this.streamReply(stream, request, reply);
    } catch (err) {
      this.logger.warn('Problems handling a SSE request', err);
      return reply(wrap(err));
    }
  }

  public validateDeploymentToken(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    try {
      const { token, deploymentId: _deploymentId, projectId: _projectId } = request.params;
      const deploymentId = Number(_deploymentId);
      const projectId = Number(_projectId);
      const correctToken = this.tokenGenerator.deploymentToken(projectId, deploymentId);

      if (!token || token !== correctToken) {
        return reply(forbidden('Invalid token'));
      }

      return reply('ok');

    } catch (error) {
      // Nothing to be done here
    }
    return reply(forbidden('Invalid token'));

  }

  public async authorizeDeployment(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    try {
      const { deploymentId: _deploymentId, projectId: _projectId } = request.params;
      const deploymentId = Number(_deploymentId);
      const projectId = Number(_projectId);
      if (await request.userHasAccessToDeployment(projectId, deploymentId, request.auth.credentials)) {
        const teamId = (await request.getProjectTeam(projectId)).id;
        return reply({
          projectId,
          deploymentId,
          teamId,
        });
      }
    } catch (error) {
      this.logger.warn('Problems authorizing a realtime request', error);
    }
    return reply(notFound());
  }

  public async deploymentHandler(request: Hapi.Request, reply: Hapi.ReplyNoContinue) {
    try {
      const { teamId: _teamId, deploymentId: _deploymentId, projectId: _projectId } = (request.pre as any)[PREKEY];
      const deploymentId = Number(_deploymentId);
      const projectId = Number(_projectId);
      const teamId = Number(_teamId);
      const predicate = deploymentEventFilter(teamId, projectId, deploymentId);
      const stream = await this.getStream(teamId, predicate, getLastEventId(request));
      return this.streamReply(stream, request, reply);
    } catch (err) {
      this.logger.warn('Problems handling a realtime request', err);
      return reply(wrap(err));
    }
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
