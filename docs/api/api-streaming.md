
# Streaming API

## Request

Get events for given `teamId` with

- Method: `GET`
- URL: `/events/:teamId`

## Response

The response provides [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
with the content-type `text/event-stream`.

## Event types

### `CODE_PUSHED`

Occurs when code is pushed to a repository.

The payload has the following attributes:

Name|Type|Description
----|----|-----------
after|string|The id of the most recent commit on ref after the push
before|string|The id of the most recent commit on ref before the push
project|string|Project id
commits|[Commit](api-commit.md)[]|Pushed commits as JSON API commit resources
parents|string[]|An array of the ids of the parents of the first commit in the push.

The fields `after` and `before` have the same meanings as
in [GitHub PushEvents](https://developer.github.com/v3/activity/events/types/#pushevent).

*Example payload:*
```json
    "teamId": 2,
    "commits": [
        {
            "type": "commits",
            "id": "588-6a09c6530cc27447d6ddc3afc1fa21597dac4288",
            "attributes": {
                "message": "Improve colors and styling\n",
                "author": {
                    "email": "foo@bar.com",
                    "name": "Foo Bar",
                    "timestamp": "2016-12-23T11:18:49.000+02:00"
                },
                "committer": {
                    "email": "foo@bar.com",
                    "name": "Foo Bar",
                    "timestamp": "2016-12-23T11:18:49.000+02:00"
                },
                "hash": "6a09c6530cc27447d6ddc3afc1fa21597dac4288"
            },
            "relationships": {
                "deployments": {
                    "data": []
                }
            }
        }
    ],
    "after": "588-6a09c6530cc27447d6ddc3afc1fa21597dac4288",
    "parents": [],
    "branch": {
        "type": "branches",
        "id": "588-master",
        "attributes": {
            "name": "master",
            "minard-json": {
                "content": "{\n  \"publicRoot\": \"src\"\n}\n",
                "errors": [],
                "parsed": {
                    "publicRoot": "src"
                },
                "effective": {
                    "publicRoot": "src"
                }
            },
            "latest-activity-timestamp": "2016-12-23T11:18:49.000+02:00"
        },
        "relationships": {
            "project": {
                "data": {
                    "type": "projects",
                    "id": 588
                }
            },
            "commits": {
                "links": {
                    "self": "http://localhost:8000/api/branches/588-master/commits"
                }
            },
            "latest-commit": {
                "data": {
                    "type": "commits",
                    "id": "588-6a09c6530cc27447d6ddc3afc1fa21597dac4288"
                }
            }
        }
    },
    "project": "588"
}
```

### `COMMENT_ADDED`

Occurs when a comment is added. The data payload is a JSON API [Comment](api-comment.md) resource.

*Example payload*:

```json
{
    "type": "comments",
    "id": "56",
    "attributes": {
        "email": "foo@fooman.com",
        "name": "foo",
        "message": "foo message",
        "deployment": "588-527",
        "created-at": "2016-12-22T21:30:39.274Z"
    }
}
```

### `COMMENT_DELETED`

Occurs when a comment is deleted. The data payload has the following attributes:

Name|Type|Description
----|----|-----------
comment|string|Id of deleted comment
deployment|string|Id of related deployment

*Example payload*:

```json
{
    "comment": "56",
    "teamId": 2,
    "deployment": "588-527"
}
```

### `DEPLOYMENT_UPDATED`

Occurs when information related to a deployment changes.

The data payload has the following attributes:

Name|Type|Description
----|----|-----------
branch|string|Id of related branch
commit|string|Id of related commit
deployment|[Deployment](api-deployment.md)|Updated deployment as JSON API deployment resource
project|string|Id of related project

*Example payload:*
```json
{
    "teamId": 2,
    "branch": "588-master",
    "project": "588",
    "commit": "588-6a09c6530cc27447d6ddc3afc1fa21597dac4288",
    "deployment": {
        "type": "deployments",
        "id": "588-527",
        "attributes": {
            "status": "success",
            "url": "http://deploy-master-6a09c653-588-527.127.0.0.1.xip.io:8000",
            "creator": {
                "email": "foo@bar.com",
                "name": "Foo Bar",
                "timestamp": "2016-12-22T21:30:05.716Z"
            },
            "screenshot": "http://localhost:8000/screenshot/588/527?token=6f96f1933959bb426b3c393e9301f38593e4953e7640005e36eb86c1e54f40e3",
            "build-status": "success",
            "extraction-status": "success",
            "screenshot-status": "success",
            "comment-count": 0
        }
    }
}
```

### `NEW_ACTIVITY`

Occurs when new activity is created.

*Example payload:*
```json
{
    "type": "activities",
    "id": "375",
    "attributes": {
        "timestamp": "2016-12-22T21:30:39.274Z",
        "activity-type": "comment",
        "deployment": {
            "id": "588-527",
            "build-status": "success",
            "extraction-status": "success",
            "screenshot-status": "success",
            "status": "success",
            "finished-at": "2016-12-22T21:30:34.508Z",
            "created-at": "2016-12-22T21:30:05.716Z",
            "project-id": 588,
            "project-name": "integration-test-project",
            "creator": {
                "email": "foo@bar.com",
                "name": "Foo Bar",
                "timestamp": "2016-12-22T21:30:05.716Z"
            },
            "url": "http://deploy-master-6a09c653-588-527.127.0.0.1.xip.io:8000",
            "screenshot": "http://localhost:8000/screenshot/588/527?token=6f96f1933959bb426b3c393e9301f38593e4953e7640005e36eb86c1e54f40e3"
        },
        "project": {
            "id": "588",
            "name": "integration-test-project"
        },
        "branch": {
            "id": "588-master",
            "name": "master"
        },
        "commit": {
            "id": "588-6a09c6530cc27447d6ddc3afc1fa21597dac4288",
            "author": {
                "name": "Foo Bar",
                "email": "foo@bar.com",
                "timestamp": "2016-12-23T11:18:49.000+02:00"
            },
            "message": "Improve colors and styling\n",
            "short-id": "6a09c653",
            "committer": {
                "name": "Foo Bar",
                "email": "foo@bar.com",
                "timestamp": "2016-12-23T11:18:49.000+02:00"
            },
            "parent-ids": [],
            "hash": "6a09c6530cc27447d6ddc3afc1fa21597dac4288"
        },
        "comment": {
            "name": "foo",
            "email": "foo@fooman.com",
            "message": "foo message",
            "id": "56"
        }
    }
}
```

### `PROJECT_CREATED`

Occurs when a new project is created. The event data is a JSON API
[Project](api-project.md) resource for the newly created project.

*Example data:*
```json
{
    "data": {
        "type": "projects",
        "id": "588",
        "attributes": {
            "name": "integration-test-project",
            "description": "foo bar",
            "active-committers": [],
            "latest-activity-timestamp": "2016-12-23T02:59:46.381+05:30",
            "repo-url": "http://localhost:10080/test/integration-test-project.git"
        },
        "relationships": {
            "branches": {
                "links": {
                    "self": "http://localhost:8000/api/projects/588/branches"
                }
            }
        }
    }
}
```

### `PROJECT_DELETED`

Occurs when a project is deleted. The event data payload has the following
attributes:

Name|Type|Description
----|----|-----------
id|string|Id of deleted project

*Example payload:*

```json
{
    "id": "588"
}
```

### `PROJECT_EDITED`

Occurs when a project's name or description is edited. The event data
payload has the following attributes:

Name|Type|Description
----|----|-----------
id|number|Id of edited project
name|string|New name of edited project
description|string|New description of edited project
repo-url|string|New git repository URL for edited project

*Example payload:*

```json
{
    "id": 588,
    "name": "integration-test-project",
    "description": "foo bar bar bar",
    "repo-url": "http://localhost:10080/test/integration-test-project.git"
}
```

### `PING`

Occurs every two seconds if there are no other events
in the event stream.
