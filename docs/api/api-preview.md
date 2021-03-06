
# Preview API

The preview API provides JSON API [deployment](api-deployment.md) and [commit](api-commit.md)
resources along [project](api-project.md) and [branch](api-branch.md) information.

## Get preview

### Request

This endpoint returns the latest preview (i.e. successful deployment) for the requested entity.
The token is a secret that is sent along with the entity for which the preview is being requested.

#### By deployment id

- Method: `GET`
- URL: `api/preview/deployment/:id/:token`

#### By branch id

- Method: `GET`
- URL: `api/preview/branch/:id/:token`

#### By project id

- Method: `GET`
- URL: `api/preview/project/:id/:token`

### Response

Returns a JSON object with the following attributes:

Name|Type|Description
----|----|-----------
`deployment`|[Deployment](api-deployment.md)|Related JSON API deployment resource
`commit`|[Commit](api-commit.md)|Related JSON API commit resource
`project`|{name: string, id: string}|Related project
`branch`|{name: string, id: string}|Related branch

Note that while the object includes some JSON API resources, it is not
a JSON API response object.

*Example:*
```json
{
    "project": {
        "id": "49",
        "name": "camel-visualization"
    },
    "branch": {
        "id": "49-foo-branch-2",
        "name": "foo-branch-2"
    },
    "commit": {
        "type": "commits",
        "id": "49-9350138723ceefe3f924b512548cfea4d313258e",
        "attributes": {
            "message": "test-14\n",
            "author": {
                "name": "Juho Ojala",
                "email": "juho@lucify.com",
                "timestamp": "2016-11-10T15:21:20.000+02:00"
            },
            "committer": {
                "name": "Juho Ojala",
                "email": "juho@lucify.com",
                "timestamp": "2016-11-10T15:21:20.000+02:00"
            },
            "hash": "9350138723ceefe3f924b512548cfea4d313258e"
        },
        "relationships": {
            "deployments": {
                "data": [
                    {
                        "type": "deployments",
                        "id": "49-321"
                    }
                ]
            }
        }
    },
    "deployment": {
        "type": "deployments",
        "id": "49-321",
        "attributes": {
            "status": "success",
            "url": "https://staging-foo-branch-2-93501387-49-321.minard.io",
            "creator": {
                "email": "juho@lucify.com",
                "name": "Juho Ojala",
                "timestamp": "2016-11-10T13:21:33.663Z"
            },
            "screenshot": "https://staging.minard.io/charles/screenshot/49/321?token=063d5bf3c97eeb1924b49e91bccf41b8ae7beac370d5a60da3d70c217d1834c0",
            "build-status": "success",
            "extraction-status": "success",
            "screenshot-status": "success",
            "comment-count": 2
        }
    }
}
```
