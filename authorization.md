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

#### Needs to check team authorization

- `POST /projects`
  - `postProjectHandler`

#### Needs to check project authorization

- `POST /comments`
  - `createCommentHandler`
- `DELETE /comments/{id}`
  - `deleteCommentHandler`

#### Needs to check team or project authorization depending on request

- `POST /notifications`
  - `postNotificationConfigurationHandler`
- `DELETE /notifications/{id}`
  - `deleteNotificationConfigurationHandler`
- `GET /activity`
  - `getActivityHandler`


### Deployments `deployment-{projectId}-{deploymentId}.minard.team` 

#### Needs to check project authorization
- `GET /raw-deployment-handler/{param*}`
  - directory handler by the `inert` plugin

## Operations `/operations`
Requires admin team membership

## Status `/status`
Requires admin team membership
