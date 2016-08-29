
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import { flatMap, uniqBy } from 'lodash';
import * as moment from 'moment';
import * as queryString from 'querystring';

import { GitlabClient } from '../shared/gitlab-client';
import { Commit } from '../shared/gitlab.d.ts';
import * as logger from '../shared/logger';
import { MINARD_ERROR_CODE } from '../shared/minard-error';

import {
  MinardBranch,
  MinardCommit,
  MinardCommitAuthor,
  MinardProject,
  projectCreated,
} from './types';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';
import { Project } from '../shared/gitlab.d.ts';
import { SystemHookModule } from '../system-hook';

export function findActiveCommitters(branches: MinardBranch[]): MinardCommitAuthor[] {
  const commits = flatMap(branches,
    (branch) => branch.commits.map(commit => commit.author));
  commits.sort((a, b) => moment(a).diff(moment(b)));
  return uniqBy(commits, commit => commit.email);
}

@injectable()
export default class ProjectModule {

  public static injectSymbol = Symbol('project-module');

  private authenticationModule: AuthenticationModule;
  private systemHookModule: SystemHookModule;
  private eventBus: EventBus;
  private gitlab: GitlabClient;
  private readonly logger: logger.Logger;

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(SystemHookModule.injectSymbol) systemHookModule: SystemHookModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger) {
    this.authenticationModule = authenticationModule;
    this.systemHookModule = systemHookModule;
    this.eventBus = eventBus;
    this.gitlab = gitlab;
    this.logger = logger;
  }

  public toMinardCommit(gitlabCommit: Commit): MinardCommit {
    return {
      id: gitlabCommit.id,
      shortId: gitlabCommit.short_id,
      message: gitlabCommit.message,
      author: {
        email: gitlabCommit.author_email,
        name: gitlabCommit.author_name,
        timestamp: gitlabCommit.authored_date || gitlabCommit.created_at,
      },
      committer: {
       email: gitlabCommit.committer_email || gitlabCommit.author_email,
       name: gitlabCommit.committer_name || gitlabCommit.author_name,
       timestamp: gitlabCommit.committed_date || gitlabCommit.created_at,
      },
    };
  }

  public async getCommit(projectId: number, hash: string): Promise<MinardCommit | null> {
    try {
      const commit = await this.gitlab.fetchJson<Commit>(
        `projects/${projectId}/repository/commits/${encodeURIComponent(hash)}`);
      return this.toMinardCommit(commit);
    } catch (err) {
      if (err.status === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  public async getBranch(projectId: number, branchName: string): Promise<MinardBranch | null> {
    try {
      const commitsPromise = await this.gitlab.fetchJson<any>(
        `projects/${projectId}/repository/commits/?per_page=1000&ref_name=${encodeURIComponent(branchName)}`);
      let commits = await commitsPromise;
      if (!(commits instanceof Array)) {
        commits = [commits];
      }
      return {
        id: `${projectId}-${branchName}`,
        name: branchName,
        description: 'branch description',
        commits: commits.map(this.toMinardCommit),
      };
    } catch (err) {
      if (err.status === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  public async getAllProjectIds() {
    const projects = await this.gitlab.fetchJson<Project[]>(`projects/all`);
    if (!projects) {
      return [];
    }
    return projects.map(item => item.id);
  }

  public async getProjects(_teamId: number): Promise<MinardProject[]> {
    // TODO: for now this does not use the teamId for anything.
    // We just return all projects instead
    const projects = await this.gitlab.fetchJson<Project[]>(`projects/all`);
    if (!projects) {
      return [];
    }
    // Using getProject() here creates one extra http request for the
    // project, compared to a more specialized implementation.
    const promises = projects.map((project: Project) => this.getProject(project.id));
    const returned = await Promise.all<MinardProject | null>(promises);
    return returned.filter(item => item !== null) as MinardProject[];
  }

  public async getProject(projectId: number): Promise<MinardProject | null> {
    try {
      const projectPromise = this.gitlab.fetchJson<Project>(`projects/${projectId}`);
      const branchesPromise = this.gitlab.fetchJson<any>(`projects/${projectId}/repository/branches`);

      // we need to await for the branchesPromise to be able
      // to make requests for
      const gitlabBranches = await branchesPromise;
      const branchPromises = gitlabBranches.map((branch: any) => {
        return this.getBranch(projectId, branch.name);
      });

      const branches = await Promise.all<MinardBranch | null>(branchPromises);
      const project = await projectPromise;

      // in a super-rare edge-case a branch could be deleted after
      // we have requested the branch list. in this case we might
      // have null entries in the branches array, which we wish to
      // filter out
      const filteredBranches = branches.filter(item => item != null) as MinardBranch[];

      return {
        id: project.id,
        name: project.name,
        path: project.path,
        branches: filteredBranches,
        activeCommitters: findActiveCommitters(filteredBranches),
      };

    } catch (err) {
      if (err.response && err.response.status === 404) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  public async assureSystemHookRegistered() {
    return await this.systemHookModule
      .assureSystemHookRegistered(this.getSystemHookPath());
  }

  public receiveHook(payload: any) {
    // TODO: handle push events
  }

  private getSystemHookPath() {
    return `/project/hook`;
  }

  private async createGitlabProject(teamId: number, path: string, description?: string): Promise<Project> {
    const params = {
      name: path,
      path,
      public: false,
      description,
      // In GitLab, the namespace_id is either an user id or a group id
      // those id's do not overlap. Here we set it as the teamId, which
      // corresponds to GitLab teamId:s
      namespace_id: teamId,
    };

    const res = await this.gitlab.fetchJsonAnyStatus<any>(
      `projects?${queryString.stringify(params)}`, { method: 'POST' });
    if (res.json && res.json.message && res.json.message.path[0] === 'has already been taken') {
      throw Boom.badRequest('Name is already taken', 'name-already-taken');
    }
    if (res.status !== 201 || !res.json) {
      this.logger.error('Project creation failed for unexpected reason', res);
      throw Boom.badImplementation();
    }
    const project = res.json as Project;
    if (!project.id) {
      this.logger.error('Unexpected response from Gitlab when creating project: id is missing.', project);
      throw Boom.badImplementation();
    }
    if (project.path !== path) {
      this.logger.error('Unexpected response from Gitlab when creating project: project path is incorrect', project);
      throw Boom.badImplementation();
    }
    return project;
  }

  public async createProject(teamId: number, name: string, description?: string): Promise<number> {
    const project = await this.createGitlabProject(teamId, name, description);
    this.eventBus.post(projectCreated({
      projectId: project.id,
      description,
      name,
      teamId,
    }));
    return project.id;
  }

}
