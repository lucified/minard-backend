import { inject, injectable } from 'inversify';
import * as Knex from 'knex';

import { gitlabKnexInjectSymbol } from '../shared/types';
import { gitlabRootPasswordInjectSymbol } from './types';

@injectable()
export default class AuthenticationModule {
  public static injectSymbol = Symbol('auth-module');

  private rootToken: string;

  constructor(
    @inject(gitlabKnexInjectSymbol) private gitlabKnex: Knex,
    @inject(gitlabRootPasswordInjectSymbol) private rootPassword: string,
  ) { }

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
