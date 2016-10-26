
import 'reflect-metadata';

import { expect } from 'chai';

import {
  DeploymentHapiPlugin,
  DeploymentModule,
} from './';

describe('deployment-hapi-plugin', () => {

  describe('checkHash', () => {

    const deploymentId = 9;

    function arrange() {
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getDeployment = async (_deploymentId: number) => {
        expect(_deploymentId).to.equal(deploymentId);
        return {
          commit: {
            shortId: 'foo',
          },
        };
      };
      return new DeploymentHapiPlugin(deploymentModule, '', {} as any);
    }

    it('should return true for valid hash', async () => {
      // Arrange
      const plugin = arrange();

      // Act
      const ret = await plugin.checkHash(deploymentId, 'foo');

      // Assert
      expect(ret).to.equal(true);
    });

    it('should return false for invalid hash', async () => {
      // Arrange
      const plugin = arrange();

      // Act
      const ret = await plugin.checkHash(deploymentId, 'bar');

      // Assert
      expect(ret).to.be.false;
    });

    it('should use memoized version on second check', async () => {
      // Arrange
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getDeployment = async (_deploymentId: number) => {
        expect(_deploymentId).to.equal(deploymentId);
        return {
          commit: {
            shortId: 'foo',
          },
        };
      };
      const plugin = new DeploymentHapiPlugin(deploymentModule, '', {} as any);

      // First lookup
      expect(await plugin.checkHash(deploymentId, 'foo')).to.be.true;

      // Second lookup
      deploymentModule.getDeployment = async(_deploymentId: number) => {
        expect.fail('should not be called');
      };
      expect(await plugin.checkHash(deploymentId, 'foo')).to.be.true;
    });

    it('should use memoized version on second check', async () => {
      // Arrange
      const deploymentModule = {} as DeploymentModule;
      deploymentModule.getDeployment = async (_deploymentId: number) => {
        if (_deploymentId === 5) {
          return {
            commit: {
              shortId: 'foo',
            },
          };
        }
        if (_deploymentId === 6) {
          return {
            commit: {
              shortId: 'bar',
            },
          };
        }
        throw 'invalid deploymentId';
      };
      const plugin = new DeploymentHapiPlugin(deploymentModule, '', {} as any);

      // Act & Assert
      expect(await plugin.checkHash(5, 'foo')).to.be.true;
      expect(await plugin.checkHash(6, 'bar')).to.be.true;
      expect(await plugin.checkHash(5, 'bar')).to.be.false;
      expect(await plugin.checkHash(6, 'foo')).to.be.false;
    });

  });

});
