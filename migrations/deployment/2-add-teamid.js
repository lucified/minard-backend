
exports.up = (knex) => Promise.all([
  knex.schema.table('deployment', table => {
    table.integer('teamId');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('deployment', table => {
    table.dropColumn('teamId');
  }),
]);
