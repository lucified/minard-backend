exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.string('slackWebhookUrl');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('slackWebhookUrl');
  }),
]);
