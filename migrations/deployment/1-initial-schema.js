
exports.up = (knex) => Promise.all([
  knex.schema.createTable('deployment', table => {
    table.integer('id').primary();
    table.jsonb('commit');
    table.string('commitHash').index();
    table.string('ref').index();
    table.string('buildStatus');
    table.string('extractionStatus');
    table.string('screenshotStatus');
    table.string('status').index();
    table.integer('finishedAt').index();
    table.integer('createdAt').index();
    table.integer('projectId').index();
    table.string('projectName');
  }),
]);

exports.down = (knex) => Promise.all([
  knex.schema.dropTableIfExists('deployment'),
]);
