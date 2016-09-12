
import * as knex from 'knex';

/* eslint-disable arrow-body-style */

exports.up = (knexObj: knex) => {
  return knexObj.schema
    .createTable('activity', (table) => {
      table.increments('id').primary();
      table.dateTime('timestamp');
      table.integer('teamId').unsigned().index();
      table.integer('projectId').unsigned().index();
      table.string('projectName').unsigned();
      table.string('branch');
      table.string('activityType');
      table.json('commit');
      table.json('deployment');
      table.index(['teamId', 'timestamp']);
      table.index(['projectId', 'timestamp']);
    });
};

exports.down = (knexObj: knex) => knexObj.schema.dropTableIfExists('activity');
