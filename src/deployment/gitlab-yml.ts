
import * as Boom from 'boom';
import { merge, values } from 'lodash';
import * as YAML from 'yamljs';

interface MinardJsonBuildCommand {
  name?: string;
  command: string;
}

interface MinardJsonBuild {
  commands: MinardJsonBuildCommand[] | string[] | MinardJsonBuildCommand | string;
  image?: string;
  variables?: {
  [key: string]: string;
  };
}

interface MinardJson {
  publicRoot: string;
  build?: MinardJsonBuild;
}

// gitlab-ci.yml represented as json
interface GitlabSpec {
  image: string;
  build: {
    script: string[],
    when?: string,
    variables?: {[key: string]: string}
  };
  artifacts?: {
    name: string,
    paths: [string],
  };
}

function applyDefaults(spec: MinardJson) {
  const merged = merge({}, { publicRoot: '' }, spec);
  if (merged.build) {
    merged.build.image = merged.build.image || 'node';
  }
  return merged;
}

function getValidationErrors(obj: any) {
  const errors: string[] = [];
  if (obj.publicRoot) {
    if (obj.publicRoot.indexOf('..')) {
      errors.push('publicRoot should not contain ".."');
    }
    if (obj.publicRoot.startsWith('/')) {
      errors.push('publicRoot should not start with /');
    }
  }
  if (obj.build) {
    if (!obj.build.commands) {
      errors.push('build.commands should be defined');
    }
    if (typeof obj.build.commands === 'object') {
      if (!obj.build.commands.command) {
        errors.push('build.commands.command should be defined');
      }
    } else if (typeof obj.build.commands === 'array') {
      let count = 0;
      obj.build.commands.forEach((command: MinardJsonBuildCommand | string) => {
        if (typeof command === 'object') {
          if (!obj.build.commands.command) {
            errors.push(`build.commands[${count}].command should be defined`);
          }
        }
        count++;
      });
    } else if (typeof obj.build.commands !== 'string') {
      errors.push('build.commands should be object, array or string');
    }
  }
  if (obj.variables) {
    if (typeof obj.variables !== 'object') {
      errors.push('obj.variables should be an object');
    }
    let count = 0;
    values(obj.variables).forEach(item => {
      if (typeof item !== 'string' && typeof item !== 'number') {
        errors.push(`variables[${count}] is not a string or number`);
      }
    });
  }
  return errors;
}

function isValidMinardJson(obj: any): boolean {
  return getValidationErrors(obj).length > 0;
}

export function getGitlabYml(spec: MinardJson) {
  const gitlabSpec = getGitlabSpec(spec);
  return gitlabSpecToYml(gitlabSpec);
}

export function gitlabSpecToYml(spec: GitlabSpec) {
  return YAML.stringify(spec, 5, 2);
}

export function getGitlabSpec(spec: MinardJson) {
  if (!isValidMinardJson) {
    return getGitlabSpecInvalidMinardJson();
  }
  const mergedSpec = applyDefaults(spec);
  return spec.build ? getGitlabSpecWithBuild(mergedSpec) : getGitlabSpecNoBuild(mergedSpec);
}

function getScripts(commands: MinardJsonBuildCommand[] | string[] | MinardJsonBuildCommand | string): string[] {
  if (typeof commands === 'string') {
    return [commands];
  }
  if (typeof commands === 'object') {
    return [(<MinardJsonBuildCommand> commands).command];
  }
  const cmds = commands as {} as [MinardJsonBuildCommand | string];
  return (cmds).map(item => {
    if (typeof item === 'object') {
      return (<MinardJsonBuildCommand> item).command;
    }
    return item;
  });
}

export function getGitlabSpecInvalidMinardJson(): GitlabSpec {
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
export function getGitlabSpecWithBuild(spec: MinardJson): GitlabSpec {
  if (!spec.build) {
    throw Boom.badImplementation();
  }
  return {
    image: spec.build.image!,
    build: {
      script: getScripts(spec.build.commands),
      variables: spec.build.variables!,
    },
    artifacts: {
      name: 'artifact-name',
      paths: [
        spec.publicRoot,
      ],
    },
  };
}

/*
 * Get gitlab-ci-yml used for deployments that don't
 * require a build as a json object, based on given
 * minard.json specification.
 */
export function getGitlabSpecNoBuild(spec: MinardJson): GitlabSpec {
 return {
    image: 'alpine:latest',
    build: {
      script: [`echo 'Nothing to build'`],
    },
    artifacts: {
      name: 'artifact-name',
      paths: [
        spec.publicRoot,
      ],
    },
  };
}
