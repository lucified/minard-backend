
export function toApiCommitId(projectId: number, sha: string) {
  return `${projectId}-${sha}`;
}

export function toApiBranchId(projectId: number, branchName: string) {
  return `${projectId}-${branchName}`;
}

export function toApiDeploymentId(projectId: number, deploymentId: number) {
  return `${projectId}-${deploymentId}`;
}

export function parseApiBranchId(branchId: string) {
  const matches = branchId.match(/^(\d+)-(\S+)$/);
  if (matches !== null && matches.length === 3) {
    return {
      projectId: Number(matches[1]),
      branchName: matches[2],
    };
  }
  return null;
}
