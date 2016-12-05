
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import * as moment from 'moment';

import {
  EventBus,
  eventBusInjectSymbol,
} from '../event-bus';

import {
  DbComment,
  MinardComment,
  NewMinardComment,
  createCommentAddedEvent,
  createCommentDeletedEvent,
} from './types';

function toMinardComment(comment: DbComment): MinardComment {
  return {
    id: comment.id,
    email: comment.email,
    message: comment.message,
    createdAt: moment(Number(comment.createdAt)),
    deploymentId: comment.deploymentId,
    name: comment.name,
    teamId: comment.teamId,
    projectId: comment.projectId,
  };
}

@injectable()
export class CommentModule {

  public static injectSymbol = Symbol('comment-module');

  private knex: Knex;
  private eventBus: EventBus;

  public constructor(
    @inject('charles-knex') knex: Knex,
    @inject(eventBusInjectSymbol) eventBus: EventBus) {
    this.knex = knex;
    this.eventBus = eventBus;
  }

  public async addComment(comment: NewMinardComment): Promise<MinardComment> {
    const dbComment: DbComment = {
      createdAt: moment().valueOf(),
      deploymentId: comment.deploymentId,
      email: comment.email,
      message: comment.message,
      name: comment.name,
      status: 'n',
      teamId: comment.teamId,
      projectId: comment.projectId,
    } as any; // cast because at this point id is missing

    const ids = await this.knex('comment').insert(dbComment).returning('id');
    dbComment.id = ids[0];
    const created = toMinardComment(dbComment);
    await this.eventBus.post(createCommentAddedEvent(created));
    return created;
  }

  public async getComment(commentId: number): Promise<MinardComment | undefined> {
    const select = this.knex.select('*')
      .from('comment')
      .where('id', commentId)
      .andWhere('status', 'n')
      .limit(1)
      .first();
    const ret = await select;
    if (!ret) {
      return undefined;
    }
    return toMinardComment(ret);
  }

  public async deleteComment(commentId: number): Promise<void> {
    const comment = await this.getComment(commentId);
    if (!comment) {
      // TODO: log
      return;
    }
    await this.knex('comment')
      .update({ status: 'd'})
      .where('id', commentId);

    this.eventBus.post(createCommentDeletedEvent({
      commentId,
      teamId: comment.teamId,
      deploymentId: comment.deploymentId,
      projectId: comment.projectId,
    }));
  }

  public async getCommentsForDeployment(deploymentId: number): Promise<MinardComment[]> {
    const comments = await this.knex.select('*')
      .from('comment')
      .where('deploymentId', deploymentId)
      .andWhere('status', 'n')
      .orderBy('id', 'DESC');
    return comments.map(toMinardComment);
  }

  public async getCommentCountForDeployment(deploymentId: number): Promise<number> {
    const comments = await this.getCommentsForDeployment(deploymentId);
    return comments.length;
  }

}
