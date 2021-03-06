import { badGateway } from 'boom';
import { expect, use } from 'chai';
import 'reflect-metadata';
import { stub } from 'sinon';
import * as sinonChai from 'sinon-chai';
use(sinonChai);

import { bootstrap } from '../config';
import { MethodStubber, stubber } from '../shared/test';
import AuthenticationHapiPlugin from './authentication-hapi-plugin';
import CachedAuthenticationHapiPlugin from './cached-authentication-hapi-plugin';

function getPlugin(
  methodStubber: MethodStubber<CachedAuthenticationHapiPlugin>,
) {
  const kernel = bootstrap('test');
  kernel
    .rebind(AuthenticationHapiPlugin.injectSymbol)
    .to(CachedAuthenticationHapiPlugin);
  return stubber(methodStubber, AuthenticationHapiPlugin.injectSymbol, kernel);
}

describe('CachedAuthenticationHapiPlugin', () => {
  describe('userHasAccessToProject', () => {
    it('should memoize trues', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToProject').returns(Promise.resolve(true)),
      );

      // Act
      const res1 = await instance.userHasAccessToProject(userName, projectId);
      const res2 = await instance.userHasAccessToProject(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.true;
      expect(instance._userHasAccessToProject).to.have.been.calledOnce;
    });
    it('should not memoize falses', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToProject').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.userHasAccessToProject(userName, projectId);
      const res2 = await instance.userHasAccessToProject(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToProject).to.have.been.calledTwice;
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const projectId2 = 2;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToProject').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.userHasAccessToProject(userName, projectId);
      const res2 = await instance.userHasAccessToProject(userName, projectId2);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToProject).to.have.been.calledTwice;
    });
    it('should not memoize exceptions', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToProject').returns(
          Promise.reject(badGateway()),
        ),
      );

      // Act
      const res1 = await instance.userHasAccessToProject(userName, projectId);
      const res2 = await instance.userHasAccessToProject(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToProject).to.have.been.calledTwice;
    });
  });
  describe('userHasAccessToTeam', () => {
    it('should memoize trues', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToTeam').returns(Promise.resolve(true)),
      );

      // Act
      const res1 = await instance.userHasAccessToTeam(userName, projectId);
      const res2 = await instance.userHasAccessToTeam(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.true;
      expect(instance._userHasAccessToTeam).to.have.been.calledOnce;
    });
    it('should not memoize falses', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToTeam').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.userHasAccessToTeam(userName, projectId);
      const res2 = await instance.userHasAccessToTeam(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToTeam).to.have.been.calledTwice;
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const projectId2 = 2;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToTeam').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.userHasAccessToTeam(userName, projectId);
      const res2 = await instance.userHasAccessToTeam(userName, projectId2);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToTeam).to.have.been.calledTwice;
    });
    it('should not memoize exceptions', async () => {
      // Arrange
      const userName = 'foo';
      const projectId = 1;
      const { instance } = getPlugin(p =>
        stub(p, '_userHasAccessToTeam').returns(Promise.reject(badGateway())),
      );

      // Act
      const res1 = await instance.userHasAccessToTeam(userName, projectId);
      const res2 = await instance.userHasAccessToTeam(userName, projectId);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._userHasAccessToTeam).to.have.been.calledTwice;
    });
  });
  describe('isAdmin', () => {
    it('should memoize trues', async () => {
      // Arrange
      const userName = 'foo';
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_isAdmin').returns(Promise.resolve(true)),
      );

      // Act
      const res1 = await instance.isAdmin(userName);
      const res2 = await instance.isAdmin(userName);

      // Assert
      expect(res1).to.eq(res2).to.be.true;
      expect(instance._isAdmin).to.have.been.calledOnce;
      stubs.forEach(stub => stub.restore());
    });
    it('should memoize falses', async () => {
      // Arrange
      const userName = 'foo';
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_isAdmin').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.isAdmin(userName);
      const res2 = await instance.isAdmin(userName);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._isAdmin).to.have.been.calledOnce;
      stubs.forEach(stub => stub.restore());
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const userName = 'foo';
      const userName2 = 'bar';

      const { instance, stubs } = getPlugin(p =>
        stub(p, '_isAdmin').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.isAdmin(userName);
      const res2 = await instance.isAdmin(userName2);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._isAdmin).to.have.been.calledTwice;
      stubs.forEach(stub => stub.restore());
    });
    it('should not memoize exceptions', async () => {
      // Arrange
      const userName = 'foo';
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_isAdmin').returns(Promise.reject(badGateway())),
      );

      // Act
      const res1 = await instance.isAdmin(userName);
      const res2 = await instance.isAdmin(userName);

      // Assert
      expect(res1).to.eq(res2).to.be.false;
      expect(instance._isAdmin).to.have.been.calledTwice;
      stubs.forEach(stub => stub.restore());
    });
  });
  describe('getProjectTeam', () => {
    it('should memoize succesfull calls', async () => {
      // Arrange
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_getProjectTeam').returns(Promise.resolve(true)),
      );

      // Act
      const res1 = await instance.getProjectTeam(1);
      const res2 = await instance.getProjectTeam(1);

      // Assert
      expect(res1).to.eq(res2);
      expect(instance._getProjectTeam).to.have.been.calledOnce;
      stubs.forEach(stub => stub.restore());
    });
    it('should not memoize different calls', async () => {
      // Arrange
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_getProjectTeam').returns(Promise.resolve(false)),
      );

      // Act
      const res1 = await instance.getProjectTeam(1);
      const res2 = await instance.getProjectTeam(2);

      // Assert
      expect(res1).to.eq(res2);
      expect(instance._getProjectTeam).to.have.been.calledTwice;
      stubs.forEach(stub => stub.restore());
    });
    it('should not memoize exceptions', async () => {
      // Arrange
      const { instance, stubs } = getPlugin(p =>
        stub(p, '_getProjectTeam').returns(Promise.reject(badGateway())),
      );

      // Act
      try {
        await instance.getProjectTeam(1);
        expect.fail(undefined, undefined, 'Should throw');
      } catch (error) {
        // Nothing
      }
      try {
        await instance.getProjectTeam(1);
        expect.fail(undefined, undefined, 'Should throw');
      } catch (error) {
        // Nothing
      }

      // Assert
      expect(instance._getProjectTeam).to.have.been.calledTwice;
      stubs.forEach(stub => stub.restore());
    });
  });
});
