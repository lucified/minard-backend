
import { injectable } from 'inversify';

@injectable()
export default class UserModule {

  public static injectSymbol = Symbol('user-module');

}
