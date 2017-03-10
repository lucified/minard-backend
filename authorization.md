# Authorization

## JSON-API `/api`

### Accesses GitLab API
Have either project-id or team-id in the request

- `GET /projects/{projectId}`
- `POST /projects`
- `DELETE /projects/{projectId}`
- `PATCH /projects/{projectId}`
- `GET /projects/{projectId}/relationships/branches`
- `GET /teams/{teamId}/relationships/projects`
- `GET /branches/{branchId}`
- `GET /branches/{branchId}/relationships/commits`
- `GET /commits/{projectId}-{hash}`

### Accesses Postgres
Have either project-id or team-id in the request

- `GET /deployments/{projectId}-{deploymentId}`
- `GET /preview/{projectId}-{deploymentId}`
- `GET /activity`
- `GET /projects/{projectId}/relationships/notification`
- `GET /comments/deployment/{projectId}-{deploymentId}`
- `POST /comments`
- `POST /notifications`

Have either project-id or team-id in Postgres
- `DELETE /notifications/{id}`
- `DELETE /comments/{id}`

## Deployments `deployment-{projectId}-{deploymentId}.minard.team` 
Has project-id in the request

## Screenshots `/screenshot/{projectId}/{deploymentId}`
Has project-id in the request

## Realtime `/events/{teamId}`
Has team-id in the request

## Operations `/operations`
Requires admin team membership

## Status `/status`
Requires admin team membership
