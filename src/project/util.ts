
import { Project } from '../shared/gitlab';

/**
 * Checks if the provided GitLab project has public deployments enabled.
 *
 * NOTE: the 'snippets_enabled' flag is repurposed here for a completely
 * different task.
 *
 * @param project Partial<Project>
 */
export function hasPublicDeployments(project: Partial<Project>) {
  return project.snippets_enabled === true;
}

/**
 * Sets the provided GitLab project's public deployments flag.
 *
 * NOTE: the 'snippets_enabled' flag is repurposed here for a completely
 * different task.
 *
 * @param project Partial<Project>
 */
export function setPublicDeployments(project: Partial<Project>, isPublic: boolean) {
  project.snippets_enabled = isPublic;
  return project;
}
