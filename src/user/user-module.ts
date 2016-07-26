
import { inject, injectable } from 'inversify';

// only for types
import * as Knex from 'knex';


@injectable()
export default class UserModule {

  public static injectSymbol = Symbol('user-module');

  private gitlabKnex: Knex;
  private gitlabBaseUrl: string;
  private internalServerUrl: string;

  constructor(
    @inject('gitlab-knex') gitlabKnex: Knex,
    @inject('gitlab-base-url') gitlabBaseUrl: string,
    @inject('internal-server-url') internalServerUrl: string) {
    this.gitlabKnex = gitlabKnex;
    this.gitlabBaseUrl = gitlabBaseUrl;
    this.internalServerUrl = internalServerUrl;
  }

  public async getPrivateAuthenticationToken(userId: number): Promise<string> {
    const row = await this.gitlabKnex.select('authentication_token')
      .from('users').where('id', userId).first();
    return row.authentication_token;
  }

  public async getRootAuthenticationToken() {
    // TODO: cache this
    return await this.getPrivateAuthenticationToken(1);
  }

}


