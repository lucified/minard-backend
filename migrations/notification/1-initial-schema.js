
exports.up = (knex) => Promise.all([
  knex.schema.createTable('notification_configuration', table => {
    table.integer('id').primary();
    table.string('type');
    table.integer('projectId').index();
    table.string('flowToken');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.dropTableIfExists('notification_configuration'),
]);
