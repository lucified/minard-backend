import { expect } from 'chai';

import { getGitlabSpec, gitlabSpecToYml } from './gitlab-yml';
import { GitlabSpec, MinardJsonBuild, MinardJsonBuildCommand } from './types';

describe('gitlab-yml', () => {
  describe('getGitLabSpec', () => {
    const defaultImage = 'node:latest';
    const command = 'npm-run-script-build';

    it('should return correct spec when there is no build', () => {
      const minardJson = {
        publicRoot: 'foo',
      };
      const spec = getGitlabSpec(minardJson);
      expect(spec.build.artifacts).to.exist;
      expect(spec.build.artifacts!.paths).to.have.length(1);
      expect(spec.build.artifacts!.paths[0]).to.equal(minardJson.publicRoot);
      expect(spec.build.script).to.have.length(1);
      expect(spec.build.script[0]).to.equal(`echo 'Nothing to build'`);
    });

    function expectCorrectBuildSpec(
      spec: GitlabSpec,
      expectedPublicRoot: string,
      expectedImage: string,
      expectedScript: string,
    ) {
      expect(spec.build.artifacts).to.exist;
      expect(spec.build.artifacts!.paths).to.have.length(1);
      expect(spec.build.artifacts!.paths[0]).to.equal(expectedPublicRoot);
      expect(spec.image).to.equal(expectedImage);
      expect(spec.build.script).to.have.length(1);
      expect(spec.build.script[0]).to.equal(expectedScript);
    }

    it('should return correct spec when there is a build with no image specified', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: 'npm run-script build',
        },
      };
      const spec = getGitlabSpec(minardJson);
      expect(spec.build.artifacts).to.exist;
      expect(spec.build.artifacts!.paths).to.have.length(1);
      expect(spec.build.artifacts!.paths[0]).to.equal(minardJson.publicRoot);
      expect(spec.image).to.equal('node:latest');
      expect(spec.build.script).to.have.length(1);
      expect(spec.build.script[0]).to.equal(minardJson.build.commands);
    });

    it('should return correct spec when commands is a string', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: command,
        },
      };
      const spec = getGitlabSpec(minardJson);
      expectCorrectBuildSpec(
        spec,
        minardJson.publicRoot,
        defaultImage,
        command,
      );
    });

    it('should return correct spec when commands is an object', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: {
            name: 'build',
            command,
          },
        },
      };
      const spec = getGitlabSpec(minardJson);
      expectCorrectBuildSpec(
        spec,
        minardJson.publicRoot,
        defaultImage,
        command,
      );
    });

    it('should return correct spec when commands is an an array of strings', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: [command],
        },
      };
      const spec = getGitlabSpec(minardJson);
      expectCorrectBuildSpec(
        spec,
        minardJson.publicRoot,
        defaultImage,
        command,
      );
    });

    it('should return correct spec when commands is an array of objects', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: [
            {
              name: 'build',
              command,
            },
          ],
        },
      };
      const spec = getGitlabSpec(minardJson);
      expectCorrectBuildSpec(
        spec,
        minardJson.publicRoot,
        defaultImage,
        command,
      );
    });

    it('should return correct spec when cache settings are included', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: [
            {
              name: 'build',
              command,
            },
          ],
          cache: {
            paths: 'node_modules',
          },
        },
      };
      const spec = getGitlabSpec(minardJson);
      expectCorrectBuildSpec(
        spec,
        minardJson.publicRoot,
        defaultImage,
        command,
      );
      expect(spec.cache).to.deep.equal(minardJson.build.cache);
    });

    function expectDoNotBuildSpec(spec: GitlabSpec) {
      expect(spec.build.when).to.exist;
      expect(spec.build.when).to.equal('manual');
    }

    it('should return do-not-build spec when publicRoot starts with a slash', () => {
      const minardJson = {
        publicRoot: '/foo',
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when publicRoot contains ".."', () => {
      const minardJson = {
        publicRoot: '../foo',
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when build is defined but has no commands', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {} as MinardJsonBuild,
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when build commands is an object with no command attribute', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: ({ name: 'foo' } as {}) as MinardJsonBuildCommand,
        },
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when build commands in an array with an object with no command attribute', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: [({ name: 'foo' } as {}) as MinardJsonBuildCommand],
        },
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when build commands is an object with invalid command attribute', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: ({
            name: 'foo',
            command: {},
          } as {}) as MinardJsonBuildCommand,
        },
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });

    it('should return do-not-build spec when build commands in an array with an object with invalid command attribute', () => {
      const minardJson = {
        publicRoot: 'foo',
        build: {
          commands: [
            ({ name: 'foo', command: {} } as {}) as MinardJsonBuildCommand,
          ],
        },
      };
      expectDoNotBuildSpec(getGitlabSpec(minardJson));
    });
  });

  describe('gitlabSpecToYaml', () => {
    // no need for many tests as implementation
    // simply calls stringify from yamljs
    it('should produce correct yaml when all options are used', () => {
      const spec: GitlabSpec = {
        image: 'node:latest',
        build: {
          script: ['npm install', 'npm run-script build'],
          artifacts: {
            name: 'artifact-name',
            paths: ['dist'],
          },
        },
        cache: {
          paths: ['node_modules'],
        },
      };
      const yaml = gitlabSpecToYml(spec);
      const expectedYaml = `image: 'node:latest'
build:
  script:
    - 'npm install'
    - 'npm run-script build'
  artifacts:
    name: artifact-name
    paths:
      - dist
cache:
  paths:
    - node_modules
`;
      expect(yaml).to.equal(expectedYaml);
    });

    it('should produce correct yaml when some options are undefined', () => {
      const spec = {
        image: 'node:latest',
        build: {
          script: ['npm install', 'npm run-script build'],
        },
        artifacts: undefined,
        cache: undefined,
      };
      const yaml = gitlabSpecToYml(spec);
      const expectedYaml = `image: 'node:latest'
build:
  script:
    - 'npm install'
    - 'npm run-script build'
`;
      expect(yaml).to.equal(expectedYaml);
    });
  });
});
