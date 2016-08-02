
import { inject, injectable } from 'inversify';

// only for types
import AuthenticationModule from '../authentication/authentication-module';
import { EventBus } from '../event-bus/event-bus';
import SystemHookModule from '../system-hook/system-hook-module';

import MinardError, { MINARD_ERROR_CODE } from '../shared/minard-error';

import { GitlabClient } from '../shared/gitlab-client';
import { Commit } from '../shared/gitlab.d.ts';

export interface MinardProject {
  id: number;
  name: string;
  path: string;
  branches: MinardBranch[];
}

export interface MinardCommitAuthor {
  name: string;
  email: string;
  timestamp: string;
}

export interface MinardCommit {
  id: string;
  shortId?: string;
  message: string;
  author: MinardCommitAuthor;
  committer: MinardCommitAuthor;
}

export interface MinardBranch {
  id: string;
  name: string;
  commits: MinardCommit[];
  project?: MinardProject;
}

@injectable()
export default class ProjectModule {

  public static injectSymbol = Symbol('user-module');

  private authenticationModule: AuthenticationModule;
  private systemHookModule: SystemHookModule;
  private eventBus: EventBus;
  private gitlab: GitlabClient;

  constructor(
    @inject(AuthenticationModule.injectSymbol) authenticationModule: AuthenticationModule,
    @inject(SystemHookModule.injectSymbol) systemHookModule: SystemHookModule,
    @inject(EventBus.injectSymbol) eventBus: EventBus,
    @inject(GitlabClient.injectSymbol) gitlab: GitlabClient) {
    this.authenticationModule = authenticationModule;
    this.systemHookModule = systemHookModule;
    this.eventBus = eventBus;
    this.gitlab = gitlab;
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

  public async getBranch(projectId: number, branchName: string): Promise<MinardBranch | null> {
    try {
      const commits = await this.gitlab.fetchJson<any>(
        `projects/${projectId}/repository/commits/${branchName}`);
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
      throw err;
    }
  }

  public async getProject(projectId: number): Promise<MinardProject | null> {
    try {
      const projectPromise = this.gitlab.fetchJson<any>(`projects/${projectId}`);
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
      const filteredBranches = branches.filter(item => item != null);

      return {
        id: project.id,
        name: project.name,
        path: project.path,
        branches: filteredBranches as MinardBranch[],
      };

    } catch (err) {
      if (err.response && err.response.status === 404) {
        return null;
      }
      throw new MinardError(
        MINARD_ERROR_CODE.INTERNAL_SERVER_ERROR,
        err.message);
    }
  }

  public async assureSystemHookRegistered() {
    return await this.systemHookModule
      .assureSystemHookRegistered(this.getSystemHookPath());
  }

  public receiveHook(payload: any) {
    if (payload.event_name === 'project_create') {
      const event = {
        type: 'project-created',
        projectId: payload.project_id,
        pathWithNameSpace: payload.path_with_namespace,
      };
      this.eventBus.post(event);
    }
  }

  private getSystemHookPath() {
    return `/project/hook`;
  }

}
