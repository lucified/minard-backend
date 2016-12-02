
exports.up = knex => Promise.all([
  knex.schema.createTable('comment', (table) => {
    table.increments('id').primary();
    table.string('email');
    table.string('name');
    table.integer('teamId');
    table.string('status');
    table.string('message');
    table.integer('projectId');
    table.integer('deploymentId').index();
    table.bigInteger('createdAt').index();
  }),
]);

exports.down = knex => Promise.all([
  knex.schema.dropTableIfExists('comment'),
]);
