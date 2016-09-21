
exports.up = (knex) => Promise.all([
  knex.schema.createTable('notification_configuration', table => {
    table.integer('id').primary();
    table.string('type');
    table.integer('projectId').index();
    table.jsonb('options');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.dropTableIfExists('notification_configuration'),
]);
