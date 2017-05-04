exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.integer('slackWebhookUrl');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('slackWebhookUrl');
  }),
]);
