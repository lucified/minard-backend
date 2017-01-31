import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { gitlabRootPasswordInjectSymbol } from './types';

@injectable()
export default class AuthenticationModule {

  public static injectSymbol = Symbol('auth-module');

  private rootToken: string;
  private rootPassword: string;
  private gitlabKnex: Knex;

  constructor(
    @inject('gitlab-knex') gitlabKnex: Knex,
    @inject(gitlabRootPasswordInjectSymbol) rootPassword: string) {
    this.gitlabKnex = gitlabKnex;
    this.rootPassword = rootPassword;
  }

  public async getPrivateAuthenticationToken(userId: number): Promise<string> {
    const row = await this.gitlabKnex.select('authentication_token')
      .from('users').where('id', userId).first();
    return row.authentication_token;
  }

  public async getRootAuthenticationToken() {
    this.rootToken = this.rootToken || await this.getPrivateAuthenticationToken(1);
    return this.rootToken;
  }

  public getRootPassword() {
    return this.rootPassword;
  }

}
