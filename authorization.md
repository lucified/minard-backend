# Authorization

## Have project-id or team-id in the path

### JSON-API `/api`

- `GET /projects/{projectId}`
- `DELETE /projects/{projectId}`
- `PATCH /projects/{projectId}`
- `GET /projects/{projectId}/relationships/branches`
- `GET /teams/{teamId}/relationships/projects`
- `GET /branches/{branchId}`
- `GET /branches/{branchId}/relationships/commits`
- `GET /commits/{projectId}-{hash}`
- `GET /deployments/{projectId}-{deploymentId}`
- `GET /preview/{projectId}-{deploymentId}`
- `GET /projects/{projectId}/relationships/notification`
- `GET /comments/deployment/{projectId}-{deploymentId}`

### Screenshots `/screenshot/{projectId}/{deploymentId}`

### Realtime `/events/{teamId}`

## Needs custom authorization logic

### JSON-API `/api`

- `POST /comments`
- `POST /notifications`
- `POST /projects`
- `GET /activity`
- `DELETE /notifications/{id}`
- `DELETE /comments/{id}`

### Deployments `deployment-{projectId}-{deploymentId}.minard.team` 
Has project-id in the request

## Operations `/operations`
Requires admin team membership

## Status `/status`
Requires admin team membership
