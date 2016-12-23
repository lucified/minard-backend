
# Branch API

The branch API deals with JSON API branch resources.
Branch resources represent individual git branches
within a [project](api-project.md).

Branch resources have the following attributes and relationships:

*Attributes*:

Name|Type|Description
----|----|-----------
name|string|Branch name
minard-json|object|Information object on minard.json
latest-activity-timestamp|date|Timestamp of latest repo activity

*Relationships*:

Name|Type|Description
----|----|-----------
project|data|Project the branch belongs to
latest-successfully-deployed-commit|data|Latest commit in branch with a succesfull deployment
latest-commit|data|Latest commit in branch
commits|link|Branch commits

## Get branch by id

### Request

- Method: `GET`
- URL: `api/branches/:id`

### Response

Returns JSON API object including a single branch resource
with referenced `latest-successfully-deployed-commit`
and `latest-commit` and their related deployments included.

*Example:*
```json
{
    "included": [
        {
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
                "screenshot": "https://staging.minard.io/charles/screenshot/66/551?token=da8sf70sa98f7089ads7980fas7809",
                "build-status": "success",
                "extraction-status": "success",
                "screenshot-status": "success",
                "comment-count": 0
            }
        },
        {
            "type": "commits",
            "id": "66-b1feb29a8aadda20f08a7fd3302b26013be38fe5",
            "attributes": {
                "message": "Serve test builds in root, take two\n",
                "author": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-12-19T16:10:47.000+02:00"
                },
                "committer": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-12-19T16:10:47.000+02:00"
                },
                "hash": "b1feb29a8aadda20f08a7fd3302b26013be38fe5"
            },
            "relationships": {
                "deployments": {
                    "data": [
                        {
                            "type": "deployments",
                            "id": "66-551"
                        }
                    ]
                }
            }
        }
    ],
    "data": {
        "type": "branches",
        "id": "66-master",
        "attributes": {
            "name": "master",
            "minard-json": {
                "content": "{\n  \"publicRoot\": \"dist\",\n  \"build\": {\n    \"commands\": [\"npm install\", \"npm run build\"],\n    \"cache\": {\n      \"key\": \"%CI_PROJECT_PATH%\",\n      \"paths\": [\"node_modules/\"]\n    }\n  }\n}\n",
                "errors": [],
                "parsed": {
                    "publicRoot": "dist",
                    "build": {
                        "commands": [
                            "npm install",
                            "npm run build"
                        ],
                        "cache": {
                            "key": "%CI_PROJECT_PATH%",
                            "paths": [
                                "node_modules/"
                            ]
                        }
                    }
                },
                "effective": {
                    "publicRoot": "dist",
                    "build": {
                        "commands": [
                            "npm install",
                            "npm run build"
                        ],
                        "cache": {
                            "key": "%CI_PROJECT_PATH%",
                            "paths": [
                                "node_modules/"
                            ]
                        },
                        "image": "node:latest"
                    }
                }
            },
            "latest-activity-timestamp": "2016-12-19T16:10:47.000+02:00"
        },
        "relationships": {
            "project": {
                "data": {
                    "type": "projects",
                    "id": 66
                }
            },
            "commits": {
                "links": {
                    "self": "https://staging.minard.io/charles/api/branches/66-master/commits"
                }
            },
            "latest-commit": {
                "data": {
                    "type": "commits",
                    "id": "66-b1feb29a8aadda20f08a7fd3302b26013be38fe5"
                }
            },
            "latest-successfully-deployed-commit": {
                "data": {
                    "type": "commits",
                    "id": "66-b1feb29a8aadda20f08a7fd3302b26013be38fe5"
                }
            }
        }
    }
}
```

## Get project branches

### Request

- Method: `GET`
- URL: `api/projects/:id/relationships/branches`

### Response

Returns JSON API object with a collection of branch resources for the
given project with referenced `latest-successfully-deployed-commit`
and `latest-commit` and their related deployments included.
