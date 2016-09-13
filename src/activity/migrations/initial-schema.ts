
import * as Knex from 'knex';

exports.up = (knex: Knex) => {
  return Promise.all([
    knex.schema.createTable('activity', table => {
      table.increments('id').primary();
      table.bigInteger('timestamp');
      table.integer('teamId').unsigned().index();
      table.integer('projectId').unsigned().index();
      table.string('projectName').unsigned();
      table.string('branch');
      table.string('activityType');
      table.jsonb('commit');
      table.jsonb('deployment');
      table.index(['teamId', 'timestamp']);
      table.index(['projectId', 'timestamp']);
    }),
  ]);
};

exports.down = (knex: Knex) => {
  return Promise.all([
    knex.schema.dropTableIfExists('activity'),
  ]);
};
