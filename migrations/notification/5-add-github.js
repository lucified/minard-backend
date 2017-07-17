exports.up = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.integer('githubInstallationId');
    table.string('githubOwner');
    table.string('githubRepo');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.table('notification_configuration', table => {
    table.dropColumn('githubInstallationId');
    table.dropColumn('githubOwner');
    table.dropColumn('githubRepo');
  }),
]);
