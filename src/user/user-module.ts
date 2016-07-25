
import { inject, injectable } from 'inversify';

// only for types
import * as Knex from 'knex';

@injectable()
export default class UserModule {

  public static injectSymbol = Symbol('user-module');

  private gitlabKnex: Knex;

  constructor(@inject('gitlab-knex') gitlabKnex: Knex) {
    this.gitlabKnex = gitlabKnex;
  }

  public async getPrivateAuthenticationToken(userId: number): Promise<string> {
    const row = await this.gitlabKnex.select('authentication_token')
      .from('users').where('id', userId).first();
    return row.authentication_token;
  }

}


