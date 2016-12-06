
exports.up = knex => Promise.all([
  knex.schema.table('activity', (table) => {
    table.string('email');
    table.string('name');
    table.string('message');
    table.integer('commentId');
  }),
]);

exports.down = knex => Promise.all([
  knex.schema.table('activity', (table) => {
    table.dropColumn('email');
    table.dropColumn('name');
    table.dropColumn('message');
    table.dropColumn('commentId');
  }),
]);
