
import { createHmac } from 'crypto';
import { inject, injectable } from 'inversify';

export const tokenSecretInjectSymbol = Symbol('token-secret');

@injectable()
export default class TokenGenerator {
  public static injectSymbol = Symbol('token-generator');
  private readonly secret: string;

  constructor(
    @inject(tokenSecretInjectSymbol) secret: string) {
    this.secret = secret;
  }

  public deploymentToken(projectId: number, deploymentId: number) {
    const hash = createHmac('sha256', this.secret)
      .update(`P${projectId}-D${deploymentId}`)
      .digest('hex');
    return hash;
  }
  public projectToken(projectId: number) {
    const hash = createHmac('sha256', this.secret)
      .update(`P${projectId}`)
      .digest('hex');
    return hash;
  }
  public branchToken(projectId: number, branchName: string) {
    const hash = createHmac('sha256', this.secret)
      .update(`P${projectId}-B${branchName}`)
      .digest('hex');
    return hash;
  }
}
