import { expect } from 'chai';
import { Server } from 'hapi';
import { Container } from 'inversify';
import { SinonStub } from 'sinon';

export const expectIsNotNull = (
  obj: any | null,
): obj is string | number | boolean | object | any[] => {
  expect(obj).to.exist;
  return !!obj;
};

export type MethodStubber<T> = (
  plugin: T,
  kernel: Container,
) => SinonStub | SinonStub[];
export const stubber = <T>(
  methodStubber: MethodStubber<T>,
  injectSymbol: symbol,
  kernel: Container,
) => {
  const instance = kernel.get<T>(injectSymbol);
  const stubs = new Array<SinonStub>().concat(methodStubber(instance, kernel));
  kernel.rebind(injectSymbol).toConstantValue(instance);
  return { instance, stubs };
};

export function makeRequestWithAuthentication(accessToken: string) {
  return (
    server: Server,
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    payload?: object,
  ) =>
    server.inject({
      method,
      url: `http://foo.com${path}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      payload,
    });
}
