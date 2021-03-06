import { badGateway, badImplementation, create, notFound } from 'boom';
import { createWriteStream, existsSync } from 'fs';
import { inject, injectable } from 'inversify';
import * as Knex from 'knex';
import { isNil, omitBy, values } from 'lodash';
import * as moment from 'moment';
import { tmpdir } from 'os';
import { join } from 'path';
import { stringify } from 'querystring';
import { sprintf } from 'sprintf-js';

import { promisify } from 'util';
import { EventBus, eventBusInjectSymbol } from '../event-bus';
import { ProjectModule } from '../project';
import { ScreenshotModule } from '../screenshot';
import { Event } from '../shared/events';
import { GitlabClient } from '../shared/gitlab-client';
import { Logger, loggerInjectSymbol } from '../shared/logger';
import { MinardCommit } from '../shared/minard-commit';
import { toGitlabTimestamp } from '../shared/time-conversion';
import { charlesKnexInjectSymbol } from '../shared/types';
import {
  applyDefaults,
  getGitlabYml,
  getGitlabYmlNoAutoBuild,
  getValidationErrors,
} from './gitlab-yml';
import {
  BUILD_CREATED_EVENT,
  BUILD_STATUS_EVENT_TYPE,
  BuildCreatedEvent,
  BuildStatusEvent,
  createDeploymentEvent,
  DbDeployment,
  DEPLOYMENT_EVENT_TYPE,
  DeploymentEvent,
  DeploymentStatusUpdate,
  deploymentUrlPatternInjectSymbol,
  MinardDeployment,
  MinardDeploymentStatus,
  MinardJson,
  MinardJsonInfo,
  RepositoryObject,
} from './types';

const ncp = promisify<void, string, string>(require('ncp'));
const mkpath = promisify<void, string>(require('mkpath'));
const Queue = require('promise-queue'); // tslint:disable-line

// this lib based on https://github.com/thejoshwolfe/yauzl
const extract = promisify<void, string, object>(require('extract-zip'));

export const deploymentFolderInjectSymbol = Symbol('deployment-folder');
const _keyRegExp = '\\S+-([a-z0-9]+)-(\\d+)-(\\d+)';
const _domainRegExp = '[\\w-]+\\.[\\w-]+\\.\\S+';
export const domainRegExp = new RegExp(`^\\S+\\.(${_domainRegExp})$`);
export const hostnameRegExp = new RegExp(`^${_keyRegExp}\\.${_domainRegExp}$`);
export const deploymentVhost = 'deployment.vhost';

export function isRawDeploymentHostname(hostname: string) {
  return getDeploymentKeyFromHost(hostname) !== null;
}

export function getDeploymentKeyFromHost(hostname: string) {
  const match = hostname.match(hostnameRegExp);
  if (!match) {
    return null;
  }
  return {
    shortId: match[1],
    projectId: Number(match[2]),
    deploymentId: Number(match[3]),
  };
}

export function toDbDeployment(deployment: MinardDeployment): DbDeployment {
  const {
    id,
    commit,
    commitHash,
    ref,
    buildStatus,
    extractionStatus,
    screenshotStatus,
    status,
    projectId,
    projectName,
    teamId,
  } = deployment;
  return {
    id,
    commit: JSON.stringify(commit),
    commitHash,
    ref,
    buildStatus,
    extractionStatus,
    screenshotStatus,
    status,
    projectId,
    projectName,
    teamId,
    finishedAt: deployment.finishedAt && deployment.finishedAt.valueOf(),
    createdAt: deployment.createdAt.valueOf(),
  };
}

@injectable()
export default class DeploymentModule {
  public static injectSymbol = Symbol('deployment-module');
  private readonly prepareQueue: any;

  public constructor(
    @inject(GitlabClient.injectSymbol) private readonly gitlab: GitlabClient,
    @inject(deploymentFolderInjectSymbol)
    private readonly deploymentFolder: string,
    @inject(eventBusInjectSymbol) private readonly eventBus: EventBus,
    @inject(loggerInjectSymbol) private readonly logger: Logger,
    @inject(deploymentUrlPatternInjectSymbol)
    private readonly urlPattern: string,
    @inject(ScreenshotModule.injectSymbol)
    private readonly screenshotModule: ScreenshotModule,
    @inject(ProjectModule.injectSymbol)
    private readonly projectModule: ProjectModule,
    @inject(charlesKnexInjectSymbol) private readonly knex: Knex,
  ) {
    this.prepareQueue = new Queue(1, Infinity);
    this.subscribeToEvents();
    this.toMinardDeployment = this.toMinardDeployment.bind(this);
  }

  private subscribeToEvents() {
    // subscribe for build created events
    this.eventBus
      .filterEvents<BuildCreatedEvent>(BUILD_CREATED_EVENT)
      .flatMap(async event => {
        try {
          await this.createDeployment(event);
        } catch (error) {
          this.logger.error(
            `Failed to create deployment based on BuildCreatedEvent`,
            { event, error },
          );
        }
      })
      .subscribe();

    // subscribe on build status updates
    this.eventBus
      .filterEvents<BuildStatusEvent>(BUILD_STATUS_EVENT_TYPE)
      .flatMap(async event => {
        try {
          await this.updateDeploymentStatus(event.payload.deploymentId, {
            buildStatus: event.payload.status,
          });
        } catch (error) {
          this.logger.error(
            `Failed to update deployment status based on BuildStatusEvent`,
            { event, error },
          );
        }
      })
      .subscribe();

    // subscribe on finished builds
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(event => event.payload.statusUpdate.buildStatus === 'success')
      .flatMap(async event => {
        const { projectId, id } = event.payload.deployment;
        try {
          await this.prepareDeploymentForServing(projectId, id, false);
        } catch (error) {
          this.logger.error(
            `Failed to prepare deployment ${id} for serving`,
            error,
          );
        }
      })
      .subscribe();

    // subscribe on extracted builds
    this.eventBus
      .filterEvents<DeploymentEvent>(DEPLOYMENT_EVENT_TYPE)
      .filter(
        event => event.payload.statusUpdate.extractionStatus === 'success',
      )
      .flatMap(event => {
        const { projectId, id } = event.payload.deployment;
        return this.takeScreenshot(
          projectId,
          id,
          event.payload.deployment.commit.shortId,
        );
      }, 1)
      .subscribe();
  }

  // internal method
  public async takeScreenshot(
    projectId: number,
    deploymentId: number,
    shortId: string,
  ) {
    try {
      await this.updateDeploymentStatus(deploymentId, {
        screenshotStatus: 'running',
      });
      await this.screenshotModule.takeScreenshot(
        projectId,
        deploymentId,
        shortId,
      );
      await this.updateDeploymentStatus(deploymentId, {
        screenshotStatus: 'success',
      });
    } catch (err) {
      await this.updateDeploymentStatus(deploymentId, {
        screenshotStatus: 'failed',
      });
    }
  }

  public async createDeployment(event: Event<BuildCreatedEvent>) {
    const payload = event.payload;
    const [commit, project] = await Promise.all([
      this.projectModule.getCommit(payload.project_id, payload.sha),
      this.projectModule.getProject(payload.project_id),
    ]);
    if (!commit) {
      this.logger.error(
        `Commit ${payload.sha} in project ${payload.project_id} not found while in createDeployment`,
      );
      return;
    }
    if (!project) {
      this.logger.error(
        `Project ${payload.project_id} not found while in createDeployment`,
      );
      return;
    }

    const deployment: MinardDeployment = {
      teamId: project.teamId,
      id: payload.id,
      ref: payload.ref,
      projectId: payload.project_id,
      projectName: payload.project_name,
      buildStatus: 'pending',
      extractionStatus: 'pending',
      screenshotStatus: 'pending',
      status: 'pending',
      commit,
      commitHash: payload.sha,
      createdAt: event.created,
    };
    await this.knex('deployment').insert(toDbDeployment(deployment));
    await this.updateDeploymentStatus(payload.id, {
      buildStatus: payload.status,
    });
  }

  public async getProjectDeployments(
    projectId: number,
  ): Promise<MinardDeployment[]> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('projectId', projectId)
      .orderBy('id', 'DESC');
    return (await select).map(this.toMinardDeployment);
  }

  public async getLatestSuccessfulProjectDeployment(
    projectId: number,
  ): Promise<MinardDeployment | undefined> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('status', 'success')
      .orderBy('id', 'DESC')
      .limit(1)
      .first();
    const ret = await select;
    return ret ? this.toMinardDeployment(ret) : undefined;
  }

  public async getLatestSuccessfulBranchDeployment(
    projectId: number,
    branchName: string,
    latestSha: string,
  ): Promise<MinardDeployment | undefined> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('status', 'success')
      .andWhere('ref', branchName)
      .orderBy('id', 'DESC')
      .limit(1)
      .first();
    let ret = await select;

    // The above lookup will only find deployments that
    // have been done with this branchName, and it will
    // not find previous commits that have been done in
    // another branch.
    //
    // If we fail to find any deployments with the above lookup, we
    // check whether there is a deployment for the latest commit
    // of the branch and return that, if available.
    //
    // This overall logic does not cover some rare cases, but
    // works well for the most typical cases. The 'correct' solution
    // would search through all commits in the branch for deployments.
    //
    if (!ret) {
      ret = await this.knex
        .select('*')
        .from('deployment')
        .where('projectId', projectId)
        .andWhere('status', 'success')
        .andWhere('commitHash', latestSha)
        .orderBy('id', 'DESC')
        .limit(1)
        .first();
    }
    return ret ? this.toMinardDeployment(ret) : undefined;
  }

  public async getCommitDeployments(
    projectId: number,
    sha: string,
  ): Promise<MinardDeployment[]> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('projectId', projectId)
      .andWhere('commitHash', sha)
      .orderBy('id', 'DESC');
    return (await select).map(this.toMinardDeployment);
  }

  public async getDeploymentsByStatus(
    status: MinardDeploymentStatus,
  ): Promise<MinardDeployment[]> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('status', status)
      .orderBy('id', 'DESC');
    return (await select).map(this.toMinardDeployment);
  }

  public async getDeployment(
    deploymentId: number,
  ): Promise<MinardDeployment | undefined> {
    const select = this.knex
      .select('*')
      .from('deployment')
      .where('id', deploymentId)
      .limit(1)
      .first();
    const ret = await select;
    if (!ret) {
      return undefined;
    }
    return this.toMinardDeployment(ret);
  }
  /*
   * Convert deployment stored in DB to MinardDeployment
   */
  public toMinardDeployment(dbDeployment: DbDeployment): MinardDeployment {
    // The type of 'commit' here unfortunataly depends on the database driver.
    // Sqlite's doesn't parse JSONB, PostgeSQL's does
    const _commit = dbDeployment.commit;
    const commit: MinardCommit = typeof _commit === 'string'
      ? JSON.parse(_commit)
      : _commit;
    const {
      id,
      commitHash,
      ref,
      createdAt,
      finishedAt,
      buildStatus,
      extractionStatus,
      screenshotStatus,
      status,
      projectId,
      projectName,
      teamId,
    } = dbDeployment;
    const deployment: MinardDeployment = {
      id,
      commit,
      commitHash,
      ref,
      buildStatus,
      extractionStatus,
      screenshotStatus,
      status,
      projectId,
      projectName,
      teamId,
      finishedAt: finishedAt ? toMoment(finishedAt) : undefined,
      createdAt: toMoment(createdAt),
      creator: {
        email: commit.committer.email,
        name: commit.committer.name,
        timestamp: toGitlabTimestamp(toMoment(createdAt)),
      },
    };

    if (deployment.extractionStatus === 'success') {
      deployment.url = sprintf(
        this.urlPattern,
        `${deployment.ref}-${deployment.commit
          .shortId}-${deployment.projectId}-${deployment.id}`,
      );
    }
    if (deployment.screenshotStatus === 'success') {
      deployment.screenshot = this.screenshotModule.getPublicUrl(
        deployment.projectId,
        deployment.id,
      );
    }
    return deployment;
  }

  public getDeploymentPath(projectId: number, deploymentId: number) {
    return join(this.deploymentFolder, String(projectId), String(deploymentId));
  }

  public isDeploymentReadyToServe(projectId: number, deploymentId: number) {
    const path = this.getDeploymentPath(projectId, deploymentId);
    return existsSync(path);
  }

  public async filesAtPath(
    projectId: number,
    _shaOrBranchName: string,
    path: string,
  ) {
    const url = `/projects/${projectId}/repository/tree?path=${path}`;
    const ret = await this.gitlab.fetchJsonAnyStatus<RepositoryObject[]>(url);
    if (ret.status === 404) {
      throw notFound();
    }
    if (!ret.json) {
      this.logger.error(
        `Unexpected non-json response from Gitlab for ${url}`,
        ret,
      );
      throw badGateway();
    }
    if (!Array.isArray(ret.json)) {
      this.logger.error(
        `Unexpected non-array response from Gitlab for ${url}`,
        ret,
      );
      throw badImplementation();
    }
    return ret.json.map(item => ({
      type: item.type,
      name: item.name,
    }));
  }

  public async getRawMinardJson(
    projectId: number,
    shaOrBranchName: string,
  ): Promise<any> {
    const query = stringify({
      filepath: 'minard.json',
    });
    const url = `/projects/${projectId}/repository/blobs/${shaOrBranchName}?${query}`;
    const ret = await this.gitlab.fetch(url);
    if (ret.status === 404) {
      return undefined;
    }
    if (ret.status !== 200) {
      this.logger.warn(
        `Unexpected response from GitLab when fetching minard.json from ${url}`,
      );
      throw badGateway();
    }
    return await ret.text();
  }

  public async getBuildTrace(
    projectId: number,
    deploymentId: number,
  ): Promise<any> {
    const url = `/projects/${projectId}/builds/${deploymentId}/trace`;
    const ret = await this.gitlab.fetch(url);
    if (ret.status === 404) {
      throw create(404);
    }
    if (ret.status !== 200) {
      this.logger.warn(
        `Unexpected response from GitLab when fetching build trace from ${url}`,
      );
      throw create(ret.status);
    }
    return ret.text();
  }

  public async getParsedMinardJson(
    projectId: number,
    shaOrBranchName: string,
  ): Promise<any> {
    const raw = await this.getRawMinardJson(projectId, shaOrBranchName);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }

  public async getGitlabYml(
    projectId: number,
    shaOrBranchName: string,
    sha: string,
  ): Promise<string> {
    console.log(`sha or branch name ${shaOrBranchName}, ${sha}`);
    try {
      const deployments = await this.getCommitDeployments(projectId, sha);
      const filtered = deployments.filter(
        item => item.buildStatus === 'success' || item.buildStatus === 'failed',
      );
      if (filtered.length > 0) {
        return getGitlabYmlNoAutoBuild();
      }
    } catch (err) {
      this.logger.error(
        `Failed to check deployments for commit ${sha} of project ${projectId}`,
      );
      return getGitlabYmlNoAutoBuild();
    }
    try {
      const info = await this.getMinardJsonInfo(projectId, shaOrBranchName);
      if (info.effective) {
        return getGitlabYml(info.effective);
      }
      return getGitlabYmlNoAutoBuild();
    } catch (err) {
      return getGitlabYmlNoAutoBuild();
    }
  }

  public async getMinardJsonInfo(
    projectId: number,
    shaOrBranchName: string,
  ): Promise<MinardJsonInfo> {
    const content = await this.getRawMinardJson(projectId, shaOrBranchName);
    if (!content) {
      return {
        errors: [],
        content,
        effective: applyDefaults({}),
      };
    }
    let parsed: MinardJson | undefined;
    let errors: string[];
    try {
      parsed = JSON.parse(content);
      errors = getValidationErrors(parsed);
    } catch (err) {
      errors = [err.message];
      return { content, errors, parsed };
    }

    const effective = errors.length === 0 ? applyDefaults(parsed!) : undefined;

    // if the project does not have a built, we additionally
    // check that the publicRoot exists
    if (
      effective &&
      errors.length === 0 &&
      effective.publicRoot !== '.' &&
      !effective.build
    ) {
      const path = effective.publicRoot;
      const files = await this.filesAtPath(projectId, shaOrBranchName, path!);
      if (files.length === 0) {
        errors.push(`Repository does not have any any files at path ${path}`);
      }
    }
    return { content, errors, parsed, effective };
  }

  /*
   * Attempt to prepare an already finished successfull deployment
   * so that it can be served
   *
   * Throw error with friendly error message if given deployment
   * is not ready or successfull, or if there is an internal error
   * with preparing the deployment.
   */
  public prepareDeploymentForServing(
    projectId: number,
    deploymentId: number,
    checkStatus: boolean = true,
  ): Promise<void> {
    return this.prepareQueue.add(() =>
      this.doPrepareDeploymentForServing(projectId, deploymentId, checkStatus),
    );
  }

  /**
   * Prepare deployment for serving and return true on success
   */
  public async doPrepareDeploymentForServing(
    projectId: number,
    deploymentId: number,
    checkStatus: boolean = true,
  ): Promise<boolean> {
    if (checkStatus) {
      const deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        this.logger.error(
          `No deployment ${deploymentId} found when trying to prepare it for serving`,
        );
        return false;
      }
      // GitLab will return status === 'running' for a while also after
      // deployment has succeeded. if we know that the deployment is OK,
      // it is okay to skip the status check
      if (deployment.buildStatus !== 'success') {
        this.logger.error(
          `Tried to prepare deployment for serving while deployment build status is ` +
            `"${deployment.buildStatus}", projectId: ${projectId}, deploymentId: ${deploymentId}`,
        );
        return false;
      }
    }

    await this.updateDeploymentStatus(deploymentId, {
      extractionStatus: 'running',
    });

    try {
      await this.downloadAndExtractDeployment(projectId, deploymentId);
    } catch (err) {
      this.logger.error('Failed to download and extract deployment', err);
      await this.updateDeploymentStatus(deploymentId, {
        extractionStatus: 'failed',
      });
      return false;
    }

    try {
      const path = await this.moveExtractedDeployment(projectId, deploymentId);
      const extractionStatus = path ? 'success' : 'failed';
      await this.updateDeploymentStatus(deploymentId, { extractionStatus });
      return extractionStatus === 'success';
    } catch (err) {
      this.logger.error(
        `Failed to prepare deployment ${projectId}_${deploymentId} for serving`,
        err,
      );
      await this.updateDeploymentStatus(deploymentId, {
        extractionStatus: 'failed',
      });
      return false;
    }
  }

  public async updateDeploymentStatus(
    deploymentId: number,
    updates: DeploymentStatusUpdate,
  ) {
    let newStatus: MinardDeploymentStatus | undefined;
    if (
      updates.screenshotStatus === 'success' ||
      updates.screenshotStatus === 'failed'
    ) {
      newStatus = 'success'; // SIC
    } else if (
      values(updates).indexOf('failed') !== -1 ||
      values(updates).indexOf('canceled') !== -1
    ) {
      newStatus = 'failed';
    } else if (values(updates).indexOf('running') !== -1) {
      newStatus = 'running';
    }

    let deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.error(
        `Failed to fetch deployment when updating deployment status. Dropping DeploymentEvent`,
      );
      return;
    }

    function updatedStatus(
      updated: MinardDeploymentStatus | undefined,
      curr: MinardDeploymentStatus,
    ) {
      return updated && updated !== curr ? updated : undefined;
    }

    const status = updatedStatus(newStatus, deployment.status);
    const realUpdates = omitBy(
      {
        status,
        buildStatus: updatedStatus(updates.buildStatus, deployment.buildStatus),
        extractionStatus: updatedStatus(
          updates.extractionStatus,
          deployment.extractionStatus,
        ),
        screenshotStatus: updatedStatus(
          updates.screenshotStatus,
          deployment.screenshotStatus,
        ),
        finishedAt: status === 'success' || status === 'failed'
          ? moment().valueOf()
          : undefined,
      },
      isNil,
    );

    if (values(realUpdates).length > 0) {
      await this.knex('deployment')
        .update(realUpdates)
        .where('id', deploymentId);
      // this is a bit clumsy, but we need to fetch the deployment again
      // after performing the updates, as otherwise the deployment will
      // not have correct url and screenshot urls set
      deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        this.logger.error(
          `Failed to fetch deployment after updating deployment status. Dropping DeploymentEvent`,
        );
        throw badImplementation();
      }
      const payload: DeploymentEvent = {
        teamId: deployment.teamId,
        statusUpdate: omitBy({ ...realUpdates, finishedAt: undefined }, isNil),
        deployment,
      };
      this.eventBus.post(createDeploymentEvent(payload));
    }
  }

  /*
   * Download artifact zip for a deployment from
   * GitLab and extract it into a a temporary path
   */
  public async downloadAndExtractDeployment(
    projectId: number,
    deploymentId: number,
  ) {
    const url = `/projects/${projectId}/builds/${deploymentId}/artifacts`;

    const response = await this.gitlab.fetch(url);
    const tempDir = join(tmpdir(), 'minard');
    await mkpath(tempDir);
    const readableStream = response.body;
    const tempFileName = join(
      tempDir,
      `minard-${projectId}-${deploymentId}.zip`,
    );
    const writeStream = createWriteStream(tempFileName);

    await new Promise<void>((resolve, reject) => {
      readableStream.pipe(writeStream);
      readableStream.on('end', resolve);
      readableStream.on('error', reject);
      readableStream.resume();
    });

    const extractedTempPath = this.getTempArtifactsPath(
      projectId,
      deploymentId,
    );
    await mkpath(extractedTempPath);
    await extract(tempFileName, { dir: extractedTempPath });
    return extractedTempPath;
  }

  public getTempArtifactsPath(projectId: number, deploymentId: number) {
    const tempDir = join(tmpdir(), 'minard');
    return join(tempDir, `minard-${projectId}-${deploymentId}`);
  }

  public async moveExtractedDeployment(
    projectId: number,
    deploymentId: number,
  ) {
    // fetch minard.json
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.error(
        'Could not get deployment in downloadAndExtractDeployment',
      );
      throw badImplementation();
    }
    const minardJson = await this.getMinardJsonInfo(projectId, deployment.ref);

    if (!minardJson.effective) {
      // this should never happen as projects are not build if they don't
      // have an effective minard.json
      this.logger.error(
        `Detected invalid minard.json when moving extracted deployment.`,
      );
      throw badImplementation();
    }

    // move to final directory
    const extractedTempPath = this.getTempArtifactsPath(
      projectId,
      deploymentId,
    );
    const finalPath = this.getDeploymentPath(projectId, deploymentId);
    const publicRoot = minardJson.effective.publicRoot;
    const sourcePath = !publicRoot || publicRoot === '.'
      ? extractedTempPath
      : join(extractedTempPath, publicRoot);
    const exists = existsSync(sourcePath);
    if (!exists) {
      const msg =
        `Deployment "${projectId}_${deploymentId}" did not have directory at repo path ` +
        `"${minardJson.effective
          .publicRoot}". Local sourcePath was ${sourcePath}`;
      // This should be caused by an user error, so just log this as an info message
      this.logger.info(msg);
      return undefined;
    }
    try {
      await mkpath(finalPath);
    } catch (err) {
      this.logger.error(`Could not create directory ${finalPath}`, err);
      throw badImplementation();
    }
    try {
      await ncp(sourcePath, finalPath);
    } catch (err) {
      this.logger.error(
        `Could not copy extracted deployment from ${sourcePath} to  `,
        err,
      );
      throw badImplementation();
    }
    return finalPath;
  }
}

export function toMoment(date: string | number) {
  const asNumber = Number(date);
  // tslint:disable-next-line:max-line-length
  // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/isNaN#Confusing_special-case_behavior
  if (!Number.isNaN(asNumber)) {
    return moment(asNumber);
  }
  // We need to support timestamps represented also as a string
  // because in deployments stored within activity the timestamps are
  // represented as strings (at least for now)
  return moment(date);
}
