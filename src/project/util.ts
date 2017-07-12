import { Project } from '../shared/gitlab';
type CreateOrEditPayload = Partial<
  Project & { namespace_id: number; import_url: string }
>;
/**
 * Checks if the provided GitLab project has public deployments enabled.
 *
 * NOTE: the 'snippets_enabled' flag is repurposed here for a completely
 * different task.
 *
 * @param project Partial<Project>
 */
export function hasPublicDeployments(project: CreateOrEditPayload) {
  return project.snippets_enabled === true;
}

/**
 * Clones the provided GitLab project and sets its public deployments flag.
 *
 * NOTE: the 'snippets_enabled' flag is repurposed here for a completely
 * different task.
 *
 * @param project Partial<Project>
 */
export function setPublicDeployments(
  project: CreateOrEditPayload,
  isPublic: boolean | undefined,
) {
  return {
    ...project,
    snippets_enabled: isPublic,
  };
}
