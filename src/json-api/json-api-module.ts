
import * as Boom from 'boom';
import { inject, injectable } from 'inversify';
import { isNil, omitBy } from 'lodash';
import * as moment from 'moment';

import { toGitlabTimestamp, toMoment } from '../shared/time-conversion';

import {
  ApiActivity,
  ApiActivityComment,
  ApiBranch,
  ApiComment,
  ApiCommit,
  ApiDeployment,
  ApiProject,
} from './types';

import {
  ActivityModule,
  MinardActivity,
} from '../activity';

import {
  CommentModule,
  MinardComment,
  NewMinardComment,
} from '../comment';

import {
  DeploymentModule,
  MinardDeployment,
} from '../deployment/';

import {
  MinardBranch,
  MinardProject,
  ProjectModule,
} from '../project/';

import {
  ScreenshotModule,
} from '../screenshot';

import {
  NotificationConfiguration,
  NotificationModule,
} from '../notification';

import {
  MinardCommit,
} from '../shared/minard-commit';

import {
  toApiDeploymentId,
} from './conversions';

const deepcopy = require('deepcopy');

@injectable()
export class JsonApiModule {

  public static injectSymbol = Symbol('json-api-injectsymbol');
  public static factoryInjectSymbol = Symbol('json-api-factory-injectsymbol');

  private readonly deploymentModule: DeploymentModule;
  private readonly projectModule: ProjectModule;
  private readonly activityModule: ActivityModule;
  private readonly screenshotModule: ScreenshotModule;
  private readonly notificationModule: NotificationModule;
  private readonly commentModule: CommentModule;

  constructor(
    @inject(DeploymentModule.injectSymbol) deploymentModule: DeploymentModule,
    @inject(ProjectModule.injectSymbol) projectModule: ProjectModule,
    @inject(ActivityModule.injectSymbol) activityModule: ActivityModule,
    @inject(ScreenshotModule.injectSymbol) screenshotModule: ScreenshotModule,
    @inject(NotificationModule.injectSymbol) notificationModule: NotificationModule,
    @inject(CommentModule.injectSymbol) commentModule: CommentModule) {
      this.deploymentModule = deploymentModule;
      this.projectModule = projectModule;
      this.activityModule = activityModule;
      this.screenshotModule = screenshotModule;
      this.notificationModule = notificationModule;
      this.commentModule = commentModule;
  }

  public async getCommit(projectId: number, hash: string): Promise<ApiCommit | null> {
    const commit = await this.projectModule.getCommit(projectId, hash);
    return commit ? this.toApiCommit(projectId, commit) : null;
  }

  public async getProject(apiProjectId: string | number): Promise<ApiProject | null> {
    const projectId = Number(apiProjectId);
    const project = await this.projectModule.getProject(projectId);
    return project ? this.toApiProject(project) : null;
  }

  public async createProject(
    teamId: number, name: string, description?: string, templateProjectId?: number): Promise<ApiProject> {
    const id = await this.projectModule.createProject(teamId, name, description, templateProjectId);
    const project = await this.getProject(id);
    if (!project) {
      // createProject in projectModule will throw
      // if there are errors, so we should always be
      // able to get the project afterwards
      throw Boom.badImplementation();
    }
    return project;
  }

  public async deleteProject(projectId: number) {
    await this.projectModule.deleteProject(projectId);
  }

  public async editProject(
    projectId: number, attributes: { name?: string, description?: string }): Promise<ApiProject> {
    await this.projectModule.editProject(projectId, attributes);
    const project = await this.getProject(projectId);
    if (!project) {
      // createProject in projectModule will throw
      // if there are errors, so we should always be
      // able to get the project afterwards
      throw Boom.badImplementation();
    }
    return project;
  }

  public async getProjects(teamId: number): Promise<ApiProject[] | null> {
    const projects = await this.projectModule.getProjects(teamId);
    if (!projects) {
      return null;
    }
    const promises = projects.map((project: MinardProject) => this.toApiProject(project));
    return await Promise.all<ApiProject>(promises);
  }

  public async getProjectBranches(projectId: number): Promise<ApiBranch[] | null> {
    const project = await this.getProject(projectId);
    const branches = await this.projectModule.getProjectBranches(projectId);
    if (!branches || !project) {
      return null;
    }
    return await Promise.all(branches.map(branch => this.toApiBranch(project, branch)));
  }

  public async getDeployment(projectId: number, deploymentId: number): Promise<ApiDeployment | null> {
     const deployment = await this.deploymentModule.getDeployment(deploymentId);
     if (!deployment) {
       return null;
     }
     return await this.toApiDeployment(projectId, deployment);
  }

  public async getBranch(projectId: number, branchName: string): Promise<ApiBranch | null> {
    if (!branchName) {
      throw Boom.badRequest('branchName is missing');
    }
    const [project, branch] = await Promise.all([
      this.getProject(projectId),
      this.projectModule.getBranch(projectId, branchName),
    ]);
    if (!project || !branch) {
      return null;
    }
    return await this.toApiBranch(project, branch);
  }

  public async getBranchCommits(
    projectId: number,
    branchName: string,
    until?: moment.Moment,
    count: number = 10): Promise<ApiCommit[] | null> {
    const minardCommits = await this.projectModule.getBranchCommits(projectId, branchName, until, count);
    if (!minardCommits) {
      throw Boom.notFound('branch not found');
    }
    return Promise.all(minardCommits.map(commit => {
      return this.toApiCommit(projectId, commit);
    }));
  }

  public async getTeamActivity(
    teamId: number, until?: string, count: number = 10): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getTeamActivity(teamId, until ? toMoment(until) : undefined, count);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async getProjectActivity(
    projectId: number, until?: string, count: number = 10): Promise<ApiActivity[] | null> {
    const activity = await this.activityModule.getProjectActivity(
      projectId, until ? toMoment(until) : undefined, count);
    return activity ? await Promise.all(activity.map(item => this.toApiActivity(item))) : null;
  }

  public async toApiActivity(activity: MinardActivity): Promise<ApiActivity> {
    const commit = Object.assign({}, activity.commit, {
      id: `${activity.projectId}-${activity.commit.id}`,
      hash: activity.commit.id,
    });
    const project = {
      id: String(activity.projectId),
      name: activity.projectName,
    };
    const branch = {
      id: `${activity.projectId}-${activity.branch}`,
      name: activity.branch,
    };
    const deployment = Object.assign({}, activity.deployment, {
      id: `${activity.projectId}-${activity.deployment.id}`,
      creator: activity.deployment.creator!,
    });
    delete deployment.ref;
    delete deployment.commit;
    delete deployment.commitHash;
    delete deployment.teamId;
    const timestamp = toGitlabTimestamp(activity.timestamp);

    const comment: ApiActivityComment | undefined = activity.activityType === 'comment' ?
    {
      name: activity.name,
      email: activity.email!,
      message: activity.message!,
      id: String(activity.commentId!),
    } : undefined;

    const id = String(activity.id!);
    const ret: ApiActivity = {
      id,
      type: 'activity',
      branch,
      commit,
      project,
      timestamp,
      activityType: activity.activityType,
      deployment,
      comment,
    };
    return omitBy(ret, isNil) as ApiActivity;
  }

  public async toApiCommit(
    projectId: number,
    commit: MinardCommit,
    deployments?: ApiDeployment[]): Promise<ApiCommit> {
    const ret = deepcopy(commit) as ApiCommit;
    if (!commit) {
      throw Boom.badImplementation();
    }
    if (deployments) {
      ret.deployments = deployments;
    } else {
      const minardDeployments = await this.deploymentModule.getCommitDeployments(projectId, commit.id);
      if (!minardDeployments) {
        ret.deployments = [];
      } else {
        ret.deployments = await Promise.all<ApiDeployment>(
          minardDeployments.map((deployment: MinardDeployment) => this.toApiDeployment(projectId, deployment)));
      }
    }
    ret.id = `${projectId}-${commit.id}`;
    ret.hash = commit.id;
    return ret;
  }

  public async toApiDeployment(
    projectId: number,
    deployment: MinardDeployment): Promise<ApiDeployment> {
    const commentCount = await this.commentModule.getCommentCountForDeployment(deployment.id);
    return {
      id: `${projectId}-${deployment.id}`,
      commitHash: deployment.commitHash,
      url: deployment.url,
      screenshot: deployment.screenshot,
      creator: deployment.creator!,
      ref: deployment.ref,
      status: deployment.status,
      buildStatus: deployment.buildStatus,
      extractionStatus: deployment.buildStatus,
      screenshotStatus: deployment.screenshotStatus,
      commentCount,
    };
  }

  public async toApiBranch(project: ApiProject, branch: MinardBranch): Promise<ApiBranch> {
    const [ minardJson, latestCommit, minardDeployment ] = await Promise.all([
      this.deploymentModule.getMinardJsonInfo(Number(project.id), branch.name),
      this.toApiCommit(Number(project.id), branch.latestCommit),
      this.deploymentModule.getLatestSuccessfulBranchDeployment(project.id, branch.name, branch.latestCommit.id),
    ]);
    const latestSuccessfullyDeployedCommit = minardDeployment ?
      await this.minardDeploymentToApiCommit(project.id, minardDeployment) : undefined;
    return {
      type: 'branch',
      id: `${project.id}-${branch.name}`,
      project: project.id,
      name: branch.name,
      minardJson,
      latestCommit,
      latestSuccessfullyDeployedCommit,
      latestActivityTimestamp: branch.latestActivityTimestamp,
    };
  }

  private async minardDeploymentToApiCommit(projectId: number, minardDeployment: MinardDeployment): Promise<ApiCommit> {
    const deployment = await this.toApiDeployment(projectId, minardDeployment);
    return await this.toApiCommit(projectId, minardDeployment.commit, [deployment]);
  }

  public async toApiProject(project: MinardProject): Promise<ApiProject> {
    const minardDeployment = await this.deploymentModule.getLatestSuccessfulProjectDeployment(project.id);
    const latestSuccessfullyDeployedCommit = minardDeployment ?
      await this.minardDeploymentToApiCommit(project.id, minardDeployment) : undefined;
    return {
      type: 'project',
      id: project.id,
      name: project.name,
      path: project.path,
      latestActivityTimestamp: project.latestActivityTimestamp,
      latestSuccessfullyDeployedCommit,
      activeCommitters: project.activeCommitters,
      description: project.description,
      repoUrl: project.repoUrl,
    };
  }

  public async getProjectNotificationConfigurations(projectId: number) {
    return this.notificationModule.getProjectConfigurations(projectId);
  }

  public async createNotificationConfiguration(config: NotificationConfiguration) {
    return this.notificationModule.addConfiguration(config);
  }

  public async getNotificationConfiguration(id: number) {
    return this.notificationModule.getConfiguration(id);
  }

  public async deleteNotificationConfiguration(id: number) {
    return this.notificationModule.deleteConfiguration(id);
  }

  public async addComment(
    deploymentId: number,
    email: string,
    message: string,
    name?: string,
  ): Promise<ApiComment> {
    const deployment = await this.deploymentModule.getDeployment(deploymentId);
    if (!deployment) {
      throw Boom.notFound('deployment not found');
    }
    const newMinardComment: NewMinardComment = {
      projectId: deployment.projectId,
      deploymentId,
      email,
      message,
      name,
      teamId: deployment.teamId,
    };
    const created = await this.commentModule.addComment(newMinardComment);
    return this.toApiComment(created);
  }

  public async getComment(commentId: number): Promise<ApiComment> {
    const comment = await this.commentModule.getComment(commentId);
    if (!comment) {
      throw Boom.notFound();
    }
    return this.toApiComment(comment);
  }

  public async deleteComment(commentId: number): Promise<void> {
    return this.commentModule.deleteComment(commentId);
  }

  public async getDeploymentComments(deploymentId: number) {
    const comments = await this.commentModule.getCommentsForDeployment(deploymentId);
    const ret = await Promise.all(comments.map(comment => this.toApiComment(comment)));
    return ret;
  }

  public async toApiComment(comment: MinardComment): Promise<ApiComment> {
    return {
      deployment: toApiDeploymentId(comment.projectId, comment.deploymentId),
      email: comment.email,
      message: comment.message,
      name: comment.name,
      id: comment.id,
      createdAt: toGitlabTimestamp(comment.createdAt),
      project: comment.projectId,
    };
  }

}
