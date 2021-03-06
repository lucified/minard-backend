
# Deployment API

The deployment API deals with JSON API deployment resources.
Deployment resources represent deployments of specific [commits](api-commit.md)
within a [project](api-project.md).

Deployment resources have the following attributes and relationships:

Name|Type|Description
----|----|-----------
`status`|"success"&#124;"failed"&#124;"running"&#124;"pending"&#124;"canceled"|Status.
`screenshot`|string|URL to screenshot. Undefined if not available.
`comment-count`|number|Amount of comments provided for the deployment
`creator`|{name?: string, email: string, timestamp: date}|Creator of deployment

## Get deployment by id

### Request

- Method: `GET`
- URL: `api/deployments/:id`

### Response

Returns JSON API object with a single deployment resource.

*Example:*
```json
{
    "data": {
        "type": "deployments",
        "id": "66-551",
        "attributes": {
            "status": "success",
            "url": "https://staging-master-b1feb29a-66-551.minard.io",
            "creator": {
                "email": "ville.saarinen@gmail.com",
                "name": "Ville Saarinen",
                "timestamp": "2016-12-19T14:10:55.269Z"
            },
            "screenshot": "https://staging.minard.io/charles/screenshot/66/551?token=6bcb159a001f771ae9499f03addb5feae465068f900602c26a6ec31f9c79785b",
            "build-status": "success",
            "extraction-status": "success",
            "screenshot-status": "success",
            "comment-count": 0
        }
    }
}
```
