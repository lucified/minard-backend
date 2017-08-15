
# Projects API

The projects API deals with JSON API project resources.
Project resources represent individual projects, each
associated with a single git repository.

Project resources have the following attributes and relationships:

*Attributes*:

Name|Type|Description
----|----|-----------
`name`|string|Project name (max. 220 characters)
`description`|string|Project description (max. 2000 characters)
`activeCommitters`|Array[{name: string, email: string}]| List of active committers
`repo-url`|string|URL to repository for use with git
`latest-activity-timestamp`|date|Timestamp of latest repo activity

*Relationships*:

Name|Type|Description
----|----|-----------
`latest-successfully-deployed-commit`|data|Project name (max. 220 characters)
`branches`|link|Project branches

## Get project by id

### Request

- Method: `GET`
- URL: `api/projects/:id`

### Response

Returns project resource with referenced `latest-successfully-deployed-commit`
and its related deployment included.

*Example:*
```json
{
    "included": [
        {
            "type": "deployments",
            "id": "66-552",
            "attributes": {
                "status": "success",
                "url": "https://staging-new-font-and-copy-foo-66-552.minard.io",
                "creator": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-12-19T14:21:02.859Z"
                },
                "screenshot": "https://staging.minard.io/charles/screenshot/66/552?token=dfsa89f7sa89f709sda89fsa",
                "build-status": "success",
                "extraction-status": "success",
                "screenshot-status": "success",
                "comment-count": 1
            }
        },
        {
            "type": "commits",
            "id": "66-dsaf876sa89f07ds0a9f7d980saf7dsf",
            "attributes": {
                "message": "Copy tweaks\n",
                "author": {
                    "name": "Ville Saarinen",
                    "email": "ville.saarinen@gmail.com",
                    "timestamp": "2016-12-19T14:33:26.000+02:00"
                },
                "committer": {
                    "name": "Ville Saarinen",
                    "email": "ville.saarinen@gmail.com",
                    "timestamp": "2016-12-19T16:20:43.000+02:00"
                },
                "hash": "dsaf876sa89f07ds0a9f7d980saf7dsf"
            },
            "relationships": {
                "deployments": {
                    "data": [
                        {
                            "type": "deployments",
                            "id": "66-552"
                        }
                    ]
                }
            }
        }
    ],
    "data": {
        "type": "projects",
        "id": "66",
        "attributes": {
            "name": "minard-marketing",
            "description": "The marketing website for Minard",
            "active-committers": [
                {
                    "name": "Ville Saarinen",
                    "email": "ville.saarinen@gmail.com",
                    "commits": 31,
                    "additions": 0,
                    "deletions": 0
                },
                {
                    "name": "Juho Ojala",
                    "email": "juho@lucify.com",
                    "commits": 46,
                    "additions": 0,
                    "deletions": 0
                },
                {
                    "name": "Ville Väänänen",
                    "email": "ville.vaananen@lucify.com",
                    "commits": 30,
                    "additions": 0,
                    "deletions": 0
                }
            ],
            "latest-activity-timestamp": "2016-12-19T16:20:59.635+02:00",
            "repo-url": "https://foo.minard.io/lucify/minard-marketing.git"
        },
        "relationships": {
            "branches": {
                "links": {
                    "self": "https://foo.minard.io/charles/api/projects/66/branches"
                }
            },
            "latest-successfully-deployed-commit": {
                "data": {
                    "type": "commits",
                    "id": "66-dsaf876sa89f07ds0a9f7d980saf7dsf"
                }
            }
        }
    }
}
```

## Get team projects

### Request

- Method: `GET`
- URL: `api/projects/:id`

### Response

Returns response code `200` with project resources for a given team with
referenced `latest-successfully-deployed-commit` and their related
deployments included.

## Edit project

### Request

- Method: `PATCH`
- URL: `projects/:id`

Projects are edited according to JSON api. The
attributes `name`, `description` and `is-public` can be edited.

*Example payload:*
```json
{
    "data": {
        "type": "projects",
        "id": "57",
        "attributes": {
            "name": "testing-project-foo",
            "description": "jhjkhlk",
            "is-public": false
        }
    }
}
```

### Response

Responds with status code `200` with the
edited project resource.

## Create project

- Method: `POST`
- URL: `projects`

Projects are created according to JSON api. The `name`
attribute is required. A `description` attribute can be specified
as well as the `is-public` flag, which defaults to `false`. Public projects
have previews that are accessible without authentication.
Additionally, a `team` relationship must be provided,
including the `id` of the relevant team.

*Example payload*:
```json
{
    "data": {
        "type": "projects",
        "attributes": {
            "name": "foo-project",
            "description": "my description",
            "is-public": true
        },
        "relationships": {
            "team": {
                "data": {
                    "type": "teams",
                    "id": 3
                }
            }
        }
    }
}
```

## Response

Responds with status code `201` with
the created project resource.





