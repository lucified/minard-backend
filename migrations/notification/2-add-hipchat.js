
exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.integer('hipchatRoomId');
    table.string('hipchatAuthToken');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('hipchatRoomId');
    table.dropColumn('hipchatAuthToken');
  }),
]);
