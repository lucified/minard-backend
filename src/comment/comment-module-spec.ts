import { expect } from 'chai';
import * as Knex from 'knex';
import * as moment from 'moment';
import 'reflect-metadata';

import { EventBus, LocalEventBus } from '../event-bus';
import { CommentModule } from './comment-module';
import {
  COMMENT_ADDED_EVENT_TYPE,
  COMMENT_DELETED_EVENT_TYPE,
  CommentAddedEvent,
  CommentDeletedEvent,
  DbComment,
  NewMinardComment,
} from './types';

function getEventBus() {
  return new LocalEventBus();
}

describe('comment-module', () => {
  async function setupKnex() {
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await knex.migrate.latest({
      directory: 'migrations/comment',
    });
    return knex;
  }

  const dbComments: DbComment[] = [
    {
      createdAt: moment().valueOf(),
      deploymentId: 5,
      email: 'foo@foomail.com',
      id: 6,
      message: 'foo message',
      name: 'foo name',
      status: 'n',
      teamId: 7,
      projectId: 9,
    },
    {
      createdAt: moment().valueOf(),
      deploymentId: 5,
      email: 'bar@foomail.com',
      id: 12,
      message: 'bar message',
      name: 'bar name',
      status: 'n',
      teamId: 7,
      projectId: 9,
    },
    {
      createdAt: moment().valueOf(),
      deploymentId: 12,
      email: 'foobar@foomail.com',
      id: 9,
      message: 'foobar message',
      name: 'foobar name',
      status: 'n',
      teamId: 7,
      projectId: 9,
    },
  ];

  async function arrangeCommentModule(eventBus: EventBus) {
    const knex = await setupKnex();
    const commentModule = new CommentModule(knex, eventBus);
    await Promise.all(dbComments.map(item => knex('comment').insert(item)));
    return commentModule;
  }

  describe('addComment', () => {
    async function testAddComment(name: string | undefined) {
      // Arrange
      const newComment: NewMinardComment = {
        deploymentId: 18,
        email: 'barfoo@foomail.com',
        name,
        message: 'foo msg',
        teamId: 8,
        projectId: 9,
      };
      const bus = getEventBus();
      const commentModule = await arrangeCommentModule(bus);

      const promise = bus
        .filterEvents<CommentAddedEvent>(COMMENT_ADDED_EVENT_TYPE)
        .take(1)
        .toPromise();

      // Act
      const comment = await commentModule.addComment(newComment);
      const event = await promise;

      // Assert
      expect(comment.id).to.exist;
      expect(typeof comment.id).to.equal('number');
      expect(comment.message).to.equal(newComment.message);
      expect(comment.name).to.equal(newComment.name);
      expect(comment.deploymentId).to.equal(newComment.deploymentId);
      expect(comment.teamId).to.equal(newComment.teamId);
      expect(comment.projectId).to.equal(newComment.projectId);
      expect(comment.createdAt).to.exist;
      expect(comment.createdAt.isValid()).to.be.true;
      expect(event.payload.id).to.equal(comment.id);
      expect(event.payload).to.deep.equal(comment);
    }

    it('should work for a comment with a name', async () => {
      await testAddComment('barfoo');
    });

    it('should work for a comment without a name', async () => {
      await testAddComment(undefined);
    });
  });

  describe('deleteComment', () => {
    it('should work for a regular comment', async () => {
      // Arrange
      const commentId = dbComments[1].id;
      const bus = getEventBus();
      const commentModule = await arrangeCommentModule(bus);

      const promise = bus
        .filterEvents<CommentDeletedEvent>(COMMENT_DELETED_EVENT_TYPE)
        .take(1)
        .toPromise();

      // Act
      await commentModule.deleteComment(commentId);
      const event = await promise;
      const comment = await commentModule.getComment(commentId);

      // Assert
      expect(comment).to.equal(undefined);
      expect(event.payload.commentId).to.equal(commentId);
      expect(event.payload.teamId).to.equal(dbComments[1].teamId);
      expect(event.payload.projectId).to.equal(dbComments[1].projectId);
      expect(event.payload.deploymentId).to.equal(dbComments[1].deploymentId);
    });
  });

  describe('getCommentsForDeployment', () => {
    it('should work for a deployment with to comments', async () => {
      // Arrange
      const commentModule = await arrangeCommentModule({} as any);

      // Act
      const comments = await commentModule.getCommentsForDeployment(5);

      // Assert
      expect(comments).to.have.length(2);
      expect(comments[0].id).to.equal(dbComments[1].id); // check for
      expect(comments[1].id).to.equal(dbComments[0].id); // sort order
      expect(comments[0].createdAt.valueOf()).to.equal(dbComments[1].createdAt);
    });
  });

  describe('getComment', () => {
    it('should work for a typical comment ', async () => {
      // Arrange
      const commentModule = await arrangeCommentModule(getEventBus());
      const id = dbComments[1].id;

      // Act
      const comment = await commentModule.getComment(id);

      // Assert
      expect(comment).to.exist;
      expect(comment!.email).to.equal(dbComments[1].email);
      expect(comment!.message).to.equal(dbComments[1].message);
      expect(comment!.name).to.equal(dbComments[1].name);
      expect(comment!.id).to.equal(id);
      expect(comment!.teamId).to.equal(dbComments[1].teamId);
      expect(comment!.createdAt.valueOf()).to.equal(dbComments[1].createdAt);
    });
  });
});
