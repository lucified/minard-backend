
export function getUiProjectUrl(projectId: number, uiBaseUrl: string) {
  return `${uiBaseUrl}/${projectId}`;
}

export function getUiBranchUrl(projectId: number, branchName: string, uiBaseUrl: string) {
  return `${uiBaseUrl}/${projectId}/${projectId}-${branchName}`;
}
