
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import * as moment from 'moment';
import * as queryString from 'querystring';

import { GitlabClient, gitBaseUrlInjectSymbol } from '../shared/gitlab-client';
import { Branch, Commit } from '../shared/gitlab.d.ts';
import * as logger from '../shared/logger';
import { MINARD_ERROR_CODE } from '../shared/minard-error';
import { sleep } from '../shared/sleep';
import { toGitlabTimestamp } from '../shared/time-conversion';

import { GitlabPushEvent } from './gitlab-push-hook-types';

import {
  CodePushedEvent,
  MinardBranch,
  MinardProject,
  MinardProjectContributor,
  codePushed,
  projectCreated,
  projectDeleted,
  projectEdited,
} from './types';

import {
  MinardCommit,
  toMinardCommit,
} from '../shared/minard-commit';

import { AuthenticationModule } from '../authentication';
import { EventBus, eventBusInjectSymbol } from '../event-bus/';

import {
  Project,
  ProjectHook,
} from '../shared/gitlab.d.ts';

import { SystemHookModule } from '../system-hook';

@injectable()
export default class ProjectModule {

  public static injectSymbol = Symbol('project-module');

  private authenticationModule: AuthenticationModule;
  private systemHookModule: SystemHookModule;
  private eventBus: EventBus;
  private gitlab: GitlabClient;
  private readonly logger: logger.Logger;
  private readonly gitBaseUrl: string;
  public failSleepTime = 2000;

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(SystemHookModule.injectSymbol) systemHookModule: SystemHookModule,
    @inject(eventBusInjectSymbol) eventBus: EventBus,
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient,
    @inject(logger.loggerInjectSymbol) logger: logger.Logger,
    @inject(gitBaseUrlInjectSymbol) gitBaseUrl: string) {
    this.authenticationModule = authenticationModule;
    this.systemHookModule = systemHookModule;
    this.eventBus = eventBus;
    this.gitlab = gitlab;
    this.logger = logger;
    this.gitBaseUrl = gitBaseUrl;
  }

  public async getProjectContributors(projectId: number): Promise<MinardProjectContributor[] | null> {
    try {
      return await this.gitlab.fetchJson<MinardProjectContributor[]>(`projects/${projectId}/repository/contributors`);
    } catch (err) {
      if (err.isBoom && err.output.statusCode === MINARD_ERROR_CODE.NOT_FOUND) {
        // gitlab returns NOT_FOUND when there are not contributors for
        // the project, even if the project exists
        return [];
      }
      this.logger.error(`Unexpected response from GitLab when fetching project contributors for project ${projectId}`);
      throw Boom.badGateway();
    }
  }

  public async getCommit(projectId: number, hash: string): Promise<MinardCommit | null> {
    try {
      const commit = await this.gitlab.fetchJson<Commit>(
        `projects/${projectId}/repository/commits/${encodeURIComponent(hash)}`);
      return toMinardCommit(commit);
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
      .map((commit: Commit) => toMinardCommit(commit));
  }

  public toMinardBranch(projectId: number, branch: Branch): MinardBranch {
    return {
      project: projectId,
      name: branch.name,
      latestCommit: toMinardCommit(branch.commit),
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

   public async getProjectsUsingPath(path: string): Promise<MinardProject[] | null> {
    try {
      const projects = await this.gitlab.fetchJson<Project[]>(path);
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
      this.logger.error('Unexpected error when getting all projects', err);
      throw Boom.badGateway();
    }
  }

  public async getAllProjects(): Promise<MinardProject[] | null> {
    return this.getProjectsUsingPath(`projects/all`);
  }

  public async getProjects(teamId: number): Promise<MinardProject[] | null> {
    return this.getProjectsUsingPath(`groups/${teamId}/projects`);
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

  private toMinardProject(project: Project, activeCommitters: MinardProjectContributor[]): MinardProject {
    const repoUrl = `${this.gitBaseUrl}/${project.namespace.path}/${project.path}.git`;
    return {
      teamId: project.namespace.id,
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      activeCommitters,
      latestActivityTimestamp: project.last_activity_at,
      repoUrl,
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

  public async receiveProjectHook(payload: GitlabPushEvent) {
    if (payload.object_kind !== 'push') {
      return;
    }
    const projectId = payload.project_id;
    const matches = payload.ref.match(/^refs\/heads\/(\S+)$/);
    if (!matches) {
      this.logger.error(`Could not parse ref ${payload.ref}`, payload);
      return;
    }
    const ref = matches[1];
    await this.handlePushEvent(projectId, ref, payload);
  }

  public async handlePushEvent(projectId: number, ref: string, payload: GitlabPushEvent) {
    const [ after, before, mappedCommits ] = await Promise.all([
      payload.after ? this.getCommit(projectId, payload.after) : Promise.resolve(null),
      payload.before ? this.getCommit(projectId, payload.before) : Promise.resolve(null),
      Promise.all(payload.commits.map(commit => this.getCommit(projectId, commit.id))),
    ]);

    // While we don't expect getCommit to return null for these commits,
    // we wish to handle such a situtation cracefully in case it for some
    // reason still happens. The solution is to simply filter them out§
    // and add a warning to the log .

    const commits = mappedCommits.filter(item => {
      if (!item) {
        this.logger.warn(
          `getCommit called from receiveProjectHook returned null for parent commit ${item} in ${projectId}`);
        return false;
      }
      return true;
    }) as MinardCommit[];

    const parentIds = (commits[0] && commits[0]!.parentIds) || [];
    const mappedParents = await Promise.all(parentIds.map(id => this.getCommit(projectId, id)));
    const parents = mappedParents.filter(item => {
      if (!item) {
        this.logger.warn(
          `getCommit called from receiveProjectHook returned null for parent commit ${item} in ${projectId}`);
        return false;
      }
      return true;
    }) as MinardCommit[];

    const event: CodePushedEvent = {
      projectId: payload.project_id,
      ref,
      after,
      before,
      parents,
      commits,
    };
    this.eventBus.post(codePushed(event));
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
    await this.assureProjectHookRegistered(project.id);
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

  public async deleteProject(id: number): Promise<void> {
    await this.deleteGitLabProject(id);
    this.eventBus.post(projectDeleted({
      teamId: 1, // TODO
      id,
    }));
  }

  public async createProject(teamId: number, name: string, description?: string): Promise<number> {
    const project = await this.createGitlabProject(teamId, name, description);
    this.eventBus.post(projectCreated({
      id: project.id,
      description,
      name,
      teamId,
    }));
    return project.id;
  }

  public async editProject(id: number, attributes: { name?: string, description?: string}) {
    const project = await this.editGitLabProject(id, attributes);
    this.eventBus.post(projectEdited({
      teamId: 1, // TODO
      id,
      name: project.name,
      description: project.description,
    }));
  }

  public async assureProjectHooksRegistered() {
    const ids = await this.getAllProjectIds();
    let success = false;
    while (!success) {
      try {
        await Promise.all(ids.map(id => this.assureProjectHookRegistered(id)));
        success = true;
        this.logger.info('Project hooks registered for all projects.');
      } catch (err) {
        this.logger.error(
          `Failed to register project hook for all projects. Sleeping for ${this.failSleepTime} ms.`, err);
        await sleep(this.failSleepTime);
      }
    }
  }

  // internal method
  public async fetchProjectHooks(projectId: number): Promise<ProjectHook[]> {
    const hooks = await this.gitlab.fetchJson<ProjectHook[]>(`/projects/${projectId}/hooks`);
    if (!Array.isArray(hooks)) {
      throw Boom.badGateway();
    }
    return hooks;
  }

  // internal method
  public getProjectHookUrl() {
    return this.systemHookModule.getUrl('/project/project-hook');
  }

  // internal method
  public async assureProjectHookRegistered(projectId: number) {
    try {
      const hooks = await this.fetchProjectHooks(projectId);
      const found = hooks.find(item =>
        item.project_id === projectId
        && item.url === this.getProjectHookUrl()
        && item.push_events);
      if (!found) {
        this.registerProjectHook(projectId);
      }
    } catch (err) {
      this.logger.error(`Failed to register project hook for project ${projectId}`, err);
      throw err;
    }
  }

  // internal method
  public async registerProjectHook(projectId: number) {
    const params = {
      url: this.getProjectHookUrl(),
      push_events: true,
    };
    const ret = await this.gitlab.fetchJsonAnyStatus(
      `projects/${projectId}/hooks?${queryString.stringify(params)}`,
      { method: 'POST' });
    if (ret.status === 404) {
      throw Boom.notFound();
    }
    if (ret.status !== 201) {
      throw Boom.badGateway();
    }
  }

}
