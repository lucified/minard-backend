
# Commit API

The commit API returns JSON API objects with commit resources.
Commit resources represent individual git commits.

Commit resources have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`hash`|string|Commit hash (sha)
`message`|string|Commit message
`author`|{name?: string, email: string, timestamp: date}|Git author of commit
`committer`|{name?: string, email: string, timestamp: date}|Git committer of commit

*Relationships*:

Name|Type|Description
----|----|-----------
`deployments`|data|JSON API deployment resources for deployments of the commit

## Get commit by id

### Request

- Method: `GET`
- URL: `api/commits/:id`

### Response

Returns a JSON API object with a single commit resource.

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
                "screenshot": "https://staging.minard.io/charles/screenshot/66/551?token=6bcb159a001f771ae9499f03addb5feae465068f900602c26a6ec31f9c79785b",
                "build-status": "success",
                "extraction-status": "success",
                "screenshot-status": "success",
                "comment-count": 0
            }
        }
    ],
    "data": {
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
}
```

## Get commits for a branch

### Request

- Method: `GET`
- URL: `api/branches/:id/relationships/commits`

Query parameters:
Name|Type|Description
----|----|-----------
`until`|date|Return commits until the given timestamp, including commits that match `until`.
`count`|number|Minimum number of commits to return (if available)

*Example URL with query parameter:*
```
/api/branches/42-master/commits?count=10&until=2016-05-16T07%3A13%3A56.000Z
```

### Response

Returns a JSON API object including a collection of commit resources.

*Example response:*
```json
{
    "data": [
        {
            "type": "commits",
            "id": "66-0f11522937f51cecabc93c59b73508ab1f29069c",
            "attributes": {
                "message": "Merge pull request #23 from lucified/add-optimizely\n\nAdd Optimizely code and custom event for signups",
                "author": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-05-16T10:13:56.000+03:00"
                },
                "committer": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-05-16T10:13:56.000+03:00"
                },
                "hash": "0f11522937f51cecabc93c59b73508ab1f29069c"
            },
            "relationships": {
                "deployments": {
                    "data": []
                }
            }
        },
        {
            "type": "commits",
            "id": "66-e63c21b1ec71578ea77e704deaf8430bd0adccfb",
            "attributes": {
                "message": "Add Optimizely code and custom event for signups\n",
                "author": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-05-13T15:11:02.000+03:00"
                },
                "committer": {
                    "email": "ville.saarinen@gmail.com",
                    "name": "Ville Saarinen",
                    "timestamp": "2016-05-13T15:11:02.000+03:00"
                },
                "hash": "e63c21b1ec71578ea77e704deaf8430bd0adccfb"
            },
            "relationships": {
                "deployments": {
                    "data": []
                }
            }
        },
        {
            "type": "commits",
            "id": "66-7d083a417953e6384ec3852084243af2f6516499",
            "attributes": {
                "message": "Merge pull request #22 from lucified/ga-signup-tracking\n\nSend events to GA whenever signup is attempted",
                "author": {
                    "email": "juhoojala@users.noreply.github.com",
                    "name": "Juho Ojala",
                    "timestamp": "2016-05-09T17:30:02.000+03:00"
                },
                "committer": {
                    "email": "juhoojala@users.noreply.github.com",
                    "name": "Juho Ojala",
                    "timestamp": "2016-05-09T17:30:02.000+03:00"
                },
                "hash": "7d083a417953e6384ec3852084243af2f6516499"
            },
            "relationships": {
                "deployments": {
                    "data": []
                }
            }
        },
    ]
}
```
