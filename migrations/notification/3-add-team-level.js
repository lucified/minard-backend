
exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.integer('teamId').index();
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('teamId');
  }),
]);
