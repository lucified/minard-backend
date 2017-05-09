export function getUiDeploymentPreviewUrl(
  projectId: number,
  deploymentId: number,
  token: string,
  uiBaseUrl: string,
) {
  return `${uiBaseUrl}/preview/deployment/${projectId}-${deploymentId}/${token}`;
}

export function getUiCommentUrl(
  projectId: number,
  deploymentId: number,
  token: string,
  commentId: number,
  uiBaseUrl: string,
) {
  return `${uiBaseUrl}/preview/deployment/${projectId}-${deploymentId}/${token}/comment/${commentId}`;
}
