
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as moment from 'moment';
import * as queryString from 'querystring';

import { GitlabClient } from '../shared/gitlab-client';
import { Branch, Commit } from '../shared/gitlab.d.ts';
import * as logger from '../shared/logger';
import { MINARD_ERROR_CODE } from '../shared/minard-error';
import { toGitlabTimestamp } from '../shared/time-conversion';

import {
  MinardBranch,
  MinardCommit,
  MinardProject,
  MinardProjectContributor,
  projectCreated,
  projectDeleted,
  projectEdited,
} from './types';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';
import { Project } from '../shared/gitlab.d.ts';
import { SystemHookModule } from '../system-hook';

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

  public async getProjectContributors(projectId: number): Promise<MinardProjectContributor[] | null> {
    try {
      return await this.gitlab.fetchJson<MinardProjectContributor[]>(`projects/${projectId}/repository/contributors`);
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      this.logger.error(`Unexpected response from GitLab when fetching project contributors for project ${projectId}`);
      throw Boom.badGateway();
    }
  }

  public async getCommit(projectId: number, hash: string): Promise<MinardCommit | null> {
    try {
      const commit = await this.gitlab.fetchJson<Commit>(
        `projects/${projectId}/repository/commits/${encodeURIComponent(hash)}`);
      return this.toMinardCommit(commit);
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      throw Boom.wrap(err);
    }
  }

  /*
   * Fetch commits for a given branch from GitLab
   * (internal method)
   */
  public async fetchBranchCommits(
    projectId: number,
    branchName: string,
    until?: moment.Moment,
    count: number = 10): Promise<Commit[] | null> {
    try {
      const params = {
        per_page: count,
        ref_name: branchName,
        until: until ? toGitlabTimestamp(until) : undefined,
      };
      let commits = await this.gitlab.fetchJson<any>(
        `projects/${projectId}/repository/commits?${queryString.stringify(params)}`);
      if (!(commits instanceof Array)) {
        commits = [commits];
      }
      return commits;
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      this.logger.error(`Unexpected error when fetching branch commits`, err);
      throw Boom.badGateway();
    }
  }

  /*
   * Get commits for a given branch
   *
   * - projectId: id for the project
   * - branchName: name of the branch
   * - until: timestamp for latest commits that should be included
   * - count: desired number of commits that have a later timestamp than until (defaults to 10)
   * - extraCount: amount of extra commits to fetch internally (advanced option, defaults to 5)
   *
   * Given that the count parameter defines the desired amount of commits with a later timestamp
   * than the one specified, and there may be multiple commits with the same timestamp, we need
   * to fetch some extra commits to be able to deliver the requested amount. The amount of extra
   * commits to fetch is controlled by the extraCount parameter. It is used internally for recursive
   * calls when it turns out that the amount of extra commits was too small.
   */
  public async getBranchCommits(
    projectId: number,
    branchName: string,
    until?: moment.Moment,
    count: number = 10,
    extraCount: number = 5): Promise<MinardCommit[] | null> {
    const fetchAmount = count + extraCount;
    const commits = await this.fetchBranchCommits(projectId, branchName, until, fetchAmount);
    if (!commits) {
      return null;
    }
    const atUntilCount = commits.filter((commit: Commit) => {
     const createdAtMoment = moment(commit.created_at);
     if (!createdAtMoment.isValid()) {
       this.logger.error(`Commit had invalid created_at in getBranchCommits`, commit);
       return true;
     }
     return until && createdAtMoment.isSame(until);
    }).length;
    const maxReturnedCount = commits.length - atUntilCount;
    if (commits.length >= fetchAmount && maxReturnedCount < count) {
      // If we get a lot of commits where the timestamp equal until
      // we try to fetch again, this time with more extra commits.
      // This should be rare.
      return this.getBranchCommits(projectId, branchName, until, count, extraCount + 100);
    }
    return commits.slice(0, Math.min(commits.length, count + atUntilCount))
      .map((commit: Commit) => this.toMinardCommit(commit));
  }

  public toMinardBranch(projectId: number, branch: Branch): MinardBranch {
    return {
      project: projectId,
      name: branch.name,
      latestCommit: this.toMinardCommit(branch.commit),
      latestActivityTimestamp: branch.commit.created_at,
    };
  }

  public async getBranch(projectId: number, branchName: string): Promise<MinardBranch | null> {
    try {
      const branch = await this.gitlab.fetchJson<Branch>(`projects/${projectId}/repository/branches/${branchName}`);
      return this.toMinardBranch(projectId, branch);
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      throw Boom.badImplementation();
    }
  }

  public async getAllProjectIds() {
    const projects = await this.gitlab.fetchJson<Project[]>(`projects/all`);
    if (!projects) {
      return [];
    }
    return projects.map(item => item.id);
  }

  public async getProjects(_teamId: number): Promise<MinardProject[] | null> {
    // TODO: for now this does not use the teamId for anything.
    // We just return all projects instead
    try {
      const projects = await this.gitlab.fetchJson<Project[]>(`projects/all`);
      if (!projects) {
        return [];
      }
      const jobs = projects.map(project => ({
        project,
        contributorsPromise: this.getProjectContributors(project.id),
      }));
      return Promise.all(jobs.map(async item =>
        this.toMinardProject(item.project, await item.contributorsPromise || [])));

    } catch (err) {
      if (err.isBoom && err.output.statusCode === 404) {
        return null;
      }
      this.logger.error('Unexpected error when getting projects', err);
      throw Boom.badGateway();
    }
  }

  public async getProjectBranches(projectId: number): Promise<MinardBranch[] | null> {
    try {
      const branchesPromise = this.gitlab.fetchJson<Branch[]>(`projects/${projectId}/repository/branches`);
      const gitlabBranches = await branchesPromise;
      return gitlabBranches.map((branch: Branch) => {
        return this.toMinardBranch(projectId, branch);
      });
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        return null;
      }
      throw Boom.badGateway();
    }
  }

  private toMinardProject(project: Project, activeCommitters: MinardProjectContributor[]) {
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      activeCommitters,
      latestActivityTimestamp: project.last_activity_at,
    };
  }

  public async getProject(projectId: number): Promise<MinardProject | null> {
    try {
      const projectPromise = this.gitlab.fetchJson<Project>(`projects/${projectId}`);
      const contributorsPromise = this.getProjectContributors(projectId);
      const project = await projectPromise;
      const activeCommitters = (await contributorsPromise) || [];
      return this.toMinardProject(project, activeCommitters);
    } catch (err) {
      if (err.isBoom && err.output.statusCode === 404) {
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

  public async deleteGitLabProject(projectId: number) {
    const res = await this.gitlab.fetch(`projects/${projectId}`, { method: 'DELETE' });
    if (res.status === 404) {
      this.logger.warn(`Attempted to delete project ${projectId} which does not exists (according to GitLab)`);
      throw Boom.notFound('Project not found');
    }
    if (res.status !== 200) {
      this.logger.error(`Unexpected status code ${res.status} when deleting project ${projectId}`);
      throw Boom.badGateway();
    }
    // GitLab responds with status code 200 and text 'true' on success
    // the text 'true' is not documented, but it's probably still a good
    // idea to check
    const text = await res.text();
    if (text !== 'true') {
      this.logger.error(`Unexpected response from GitLab when deleting project ${projectId}: "${text}"`);
      throw Boom.badGateway();
    }
  }

  public async editGitLabProject(
    projectId: number, attributes: { name?: string, description?: string}): Promise<Project> {
    const params = {
      name: attributes.name,
      path: attributes.name,
      description: attributes.description,
    };
    const res = await this.gitlab.fetchJsonAnyStatus<any>(
      `projects/${projectId}?${queryString.stringify(params)}`,
      { method: 'PUT' }
    );
    if (res.status === 404) {
      this.logger.warn(`Attempted to edit project ${projectId} which does not exists (according to GitLab)`);
      throw Boom.notFound('Project not found');
    }
    if (res.json && res.json.message && res.json.message.path[0] === 'has already been taken') {
      throw Boom.badRequest('Name is already taken', 'name-already-taken');
    }
    if (res.status !== 200) {
      this.logger.error(`Unexpected status code ${res.status} when editing project ${projectId}`);
      throw Boom.badGateway();
    }
    const project = res.json as Project;
    // Note: we don't check that the description matches the edited description,
    // as GitLab might do some trimming of whitespace or other legit modifications
    // to the description
    if (project.id !== projectId
      || (attributes.name && project.path !== attributes.name)
      || (attributes.name && project.name !== attributes.name)) {
      this.logger.error(
        `Unexpected response payload from gitlab when editing project ${projectId}`,
        { projectId, attributes, res }
      );
      throw Boom.badGateway();
    }
    return project;
  }

  public async deleteProject(projectId: number): Promise<void> {
    await this.deleteGitLabProject(projectId);
    this.eventBus.post(projectDeleted({
      projectId,
    }));
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

  public async editProject(projectId: number, attributes: { name?: string, description?: string}) {
    const project = await this.editGitLabProject(projectId, attributes);
    this.eventBus.post(projectEdited({
      projectId,
      name: project.name,
      description: project.description,
    }));
  }

}
