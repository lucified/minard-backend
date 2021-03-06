import { badImplementation } from 'boom';
import { merge, pickBy, values } from 'lodash';
import { stringify } from 'yamljs';

import { GitlabSpec, MinardJson, MinardJsonBuildCommand } from './types';

export function applyDefaults(spec: MinardJson) {
  const merged = merge({}, { publicRoot: '.' }, spec);
  if (merged.build) {
    merged.build.image = merged.build.image || 'node:latest';
  }
  return merged;
}

export function getValidationErrors(obj: any) {
  const errors: string[] = [];
  if (obj.publicRoot) {
    if (obj.publicRoot.indexOf('..') !== -1) {
      errors.push('publicRoot should not contain ".."');
    }
    if (obj.publicRoot.startsWith('/')) {
      errors.push('publicRoot should not start with "/"');
    }
  }
  if (obj.build) {
    if (!obj.build.commands) {
      errors.push('build.commands should be defined');
    }
    if (
      typeof obj.build.commands === 'object' &&
      !Array.isArray(obj.build.commands)
    ) {
      if (!obj.build.commands.command) {
        errors.push('build.commands.command should be defined');
      } else if (typeof obj.build.commands.command !== 'string') {
        errors.push(`build.commands.command should be a string`);
      }
    } else if (
      typeof obj.build.commands === 'object' &&
      Array.isArray(obj.build.commands)
    ) {
      let count = 0;
      obj.build.commands.forEach((item: MinardJsonBuildCommand | string) => {
        if (typeof item === 'object') {
          if (!item.command) {
            errors.push(`build.commands[${count}].command should be defined`);
          }
          if (typeof item.command !== 'string') {
            errors.push(`build.commands[${count}].command is not a string`);
          }
        }
        count++;
      });
    } else if (typeof obj.build.commands !== 'string') {
      errors.push('build.commands should be a string');
    }
  }
  if (obj.variables) {
    if (typeof obj.variables !== 'object' && !Array.isArray(obj.variables)) {
      errors.push('obj.variables should be an object');
    }
    values(obj.variables).forEach((item, i) => {
      if (typeof item !== 'string' && typeof item !== 'number') {
        errors.push(`variables[${i}] is not a string or number`);
      }
    });
  }
  return errors;
}

function isValidMinardJson(obj: any): boolean {
  const errors = getValidationErrors(obj);
  return errors.length === 0;
}

export function getGitlabYmlNoAutoBuild() {
  return gitlabSpecToYml(getGitlabSpecNoAutoBuild());
}

export function getGitlabYml(spec: MinardJson) {
  const gitlabSpec = getGitlabSpec(spec);
  return gitlabSpecToYml(gitlabSpec);
}

export function gitlabSpecToYml(spec: GitlabSpec) {
  return stringify(pickBy(spec), 5, 2);
}

export function getGitlabSpec(spec: MinardJson) {
  if (!isValidMinardJson(spec)) {
    return getGitlabSpecNoAutoBuild();
  }
  const mergedSpec = applyDefaults(spec);
  return spec.build
    ? getGitlabSpecWithBuild(mergedSpec)
    : getGitlabSpecNoBuild(mergedSpec);
}

function getScripts(
  commands:
    | MinardJsonBuildCommand[]
    | string[]
    | MinardJsonBuildCommand
    | string,
): string[] {
  if (typeof commands === 'string') {
    return [commands];
  }
  if (typeof commands === 'object' && !Array.isArray(commands)) {
    return [(commands as MinardJsonBuildCommand).command];
  }
  const cmds = commands as any[];
  const ret = cmds.map((item: MinardJsonBuildCommand | string) => {
    if (typeof item === 'object' && !Array.isArray(item)) {
      return (item as MinardJsonBuildCommand).command;
    }
    if (typeof item === 'string') {
      return item;
    }
    throw badImplementation();
  });
  return ret;
}

function getGitlabSpecNoAutoBuild(): GitlabSpec {
  return {
    image: 'alpine:latest',
    build: {
      script: [`echo 'Nothing to build'`],
      when: 'manual', // this disables automatic build
    },
  };
}

/*
 * Get gitlab-ci-yml used for deployments that require
 * a build as a json object, based on given minard.json
 * specification.
 */
function getGitlabSpecWithBuild(spec: MinardJson): GitlabSpec {
  if (!spec.build) {
    throw badImplementation();
  }
  return {
    image: spec.build.image!,
    build: {
      script: getScripts(spec.build.commands),
      variables: spec.build.variables!,
      artifacts: {
        name: 'artifact-name',
        paths: [spec.publicRoot!],
      },
    },
    cache: spec.build.cache,
  };
}

/*
 * Get gitlab-ci-yml used for deployments that don't
 * require a build as a json object, based on given
 * minard.json specification.
 */
function getGitlabSpecNoBuild(spec: MinardJson): GitlabSpec {
  return {
    image: 'alpine:latest',
    build: {
      script: [`echo 'Nothing to build'`],
      artifacts: {
        name: 'artifact-name',
        paths: [spec.publicRoot!],
      },
    },
  };
}
