
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { Logger, loggerInjectSymbol } from './shared/logger';

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
    await this.createCharlesDatabase();
    await this.runMigrations();
  }

  private async runMigrations() {
    this.logger.info('Running migrations');
    const config = {
      directory: 'dist/activity/migrations',
      tableName: 'knex_migrations_activity',
    };
    await this.charlesKnex.migrate.latest(config);
    this.logger.info('Migrations finished');
  }

  private async createCharlesDatabase() {
    try {
      await this.postgresKnex.raw(`CREATE DATABASE ${this.charlesDbName}`);
      this.logger.info(`Created database "${this.charlesDbName}"`);
    } catch (err) {
      if (err.message.indexOf('already exists') !== -1) {
        this.logger.info(`Database "${this.charlesDbName}" did already exist`);
      } else {
        this.logger.error(err.message);
        throw err;
      }
    }
    this.postgresKnex.destroy();
  }

}
