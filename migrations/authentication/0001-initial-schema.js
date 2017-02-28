
exports.up = knex => Promise.all([
  knex.schema.createTable('teamtoken', (table) => {
    table.increments('id').primary();
    table.integer('teamId').index();
    table.string('token').index();
    table.bigInteger('createdAt').index();
  }),
]);

exports.down = knex => Promise.all([
  knex.schema.dropTableIfExists('teamtoken'),
]);
