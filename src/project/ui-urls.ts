
export function getUiProjectUrl(projectId: number, uiBaseUrl: string) {
  return `${uiBaseUrl}/project/${projectId}`;
}

export function getUiBranchUrl(projectId: number, branchName: string, uiBaseUrl: string) {
  return `${uiBaseUrl}/project/${projectId}/branch/${projectId}-${branchName}`;
}
