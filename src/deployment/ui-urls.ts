
export function getUiPreviewUrl(projectId: number, deploymentId: number, sha: string, uiBaseUrl: string) {
  return `${uiBaseUrl}/preview/${sha}/${projectId}-${deploymentId}`;
}

export function getUiCommentUrl(
  projectId: number, deploymentId: number, sha: string, commentId: number, uiBaseUrl: string) {
  return `${uiBaseUrl}/preview/${sha}/${projectId}-${deploymentId}/comment/${commentId}`;
}
