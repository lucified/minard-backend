
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { Logger, loggerInjectSymbol } from './shared/logger';
import { sleep } from './shared/sleep';

@injectable()
export default class Migrations {

  public static injectSymbol = Symbol('migrations');

  private readonly postgresKnex: Knex;
  private readonly charlesKnex: Knex;
  private readonly logger: Logger;
  private readonly charlesDbName: string;

  public constructor(
    @inject('charles-knex') charlesKnex: Knex,
    @inject('postgres-knex') postgresKnex: Knex,
    @inject(loggerInjectSymbol) logger: Logger,
    @inject('charles-db-name') charlesDbName: string) {
    this.postgresKnex = postgresKnex;
    this.charlesKnex = charlesKnex;
    this.logger = logger;
    this.charlesDbName = charlesDbName;
  }

  public async prepareDatabase() {
    this.logger.info('Preparing charles database');
    await this.assureDatabaseCreated();
    try {
      await this.runMigrations();
    } catch (error) {
      this.logger.error('Failed to run migrations', error);
    }
  }

  private async runMigrations() {
    this.logger.info('Running migrations');
    const configs = [
      {
        directory: 'migrations/activity',
        tableName: 'knex_migrations_activity',
      },
      {
        directory: 'migrations/deployment',
        tableName: 'knex_migrations_deployment',
      },
      {
        directory: 'migrations/notification',
        tableName: 'knex_migrations_notification',
      },
      {
        directory: 'migrations/comment',
        tableName: 'knex_migrations_comment',
      },
    ];
    for (const config of configs) {
      await this.charlesKnex.migrate.latest(config);
    }
    this.logger.info('Migrations finished');
  }

  private async assureDatabaseCreated() {
    let success = false;
    while (!success) {
      try {
        await this.createCharlesDatabase();
        success = true;
      } catch (err) {
        this.logger.info(
          `Failed to assure that charles database exists. ` +
          `Postgres is probably not (yet) running. ` +
          `Waiting for 2 seconds. Message was: ${err.message}`);
        await sleep(2000);
      }
    }
  }

  private async createCharlesDatabase() {
    try {
      await this.postgresKnex.raw(`CREATE DATABASE ${this.charlesDbName}`);
      this.logger.info(`Created database "${this.charlesDbName}"`);
    } catch (err) {
      if (err.message.indexOf('already exists') !== -1) {
        this.logger.info(`Database "${this.charlesDbName}" did already exist`);
      } else {
        throw err;
      }
    }
    this.postgresKnex.destroy();
  }

}
