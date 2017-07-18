exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.integer('githubAppId');
    table.text('githubAppPrivateKey');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('githubAppId');
    table.dropColumn('githubAppPrivateKey');
  }),
]);
