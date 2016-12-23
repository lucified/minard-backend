
# Activity API

The activity API deals with JSON API activity resources,
which have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`activity-type`|string|Type of activity. Valid values are "deployment" and "comment"
`project`|{id: string, name: string}|Related project
`branch`|{id: string, name: string}|Related branch
`deployment`|[Deployment](api-deployment.md)|Related deployment
`commit`|[Commit](api-commit.md)|Related commit
`timestamp`|date|Timestamp when activity occurred
`comment`|{id: string, message: string, name?: string, email: string}|Comment (only present in comment activitities)

## Get activitity

### Request

- Method: `GET`
- URL: `api/activity`

Query parameters:

Name|Type|Description
----|----|-----------
`filter`|string|Filter by team (`filter=team[:id]`) or project (`filter=project[:id]`).
`until`|date|Return activity until the given timestamp, including commits that match `until`.
`count`|number|Minimum number of activity resources to return (if available)

*Example request URL with query parameters:*
```
/api/activity?count=10&filter=team%5B3%5D&until=2016-12-16T08%3A25%3A46.417Z
```

### Response

Returns JSON API object including a collection of activity resources

*Example response:*
```json
{
    "data": [
        {
            "type": "activities",
            "id": "571",
            "attributes": {
                "timestamp": "2016-12-16T08:25:46.417Z",
                "activity-type": "deployment",
                "deployment": {
                    "id": "35-544",
                    "status": "success",
                    "creator": {
                        "email": "ville.saarinen@gmail.com",
                        "name": "Ville Saarinen",
                        "timestamp": "2016-12-16T08:24:41.031Z"
                    },
                    "created-at": "2016-12-16T08:24:41.031Z",
                    "project-id": 35,
                    "finished-at": "2016-12-16T08:25:46.417Z",
                    "build-status": "success",
                    "project-name": "migri-website",
                    "extraction-status": "success",
                    "screenshot-status": "success",
                    "url": "https://staging-master-9c8f12c6-35-544.minard.io",
                    "screenshot": "https://staging.minard.io/charles/screenshot/35/544?token=72359d4cc2fa0f005962e624a205010128281ff8870fca8695240f3881c7d13b"
                },
                "project": {
                    "id": "35",
                    "name": "migri-website"
                },
                "branch": {
                    "id": "35-master",
                    "name": "master"
                },
                "commit": {
                    "id": "35-9c8f12c6ee5c9a06b945272fa0d85ffc727a6588",
                    "author": {
                        "name": "Ville Saarinen",
                        "email": "ville.saarinen@gmail.com",
                        "timestamp": "2016-12-16T10:23:55.000+02:00"
                    },
                    "message": "Add padding margins paragraphs in description texts\n",
                    "short-id": "9c8f12c6",
                    "committer": {
                        "name": "Ville Saarinen",
                        "email": "ville.saarinen@gmail.com",
                        "timestamp": "2016-12-16T10:23:55.000+02:00"
                    },
                    "parent-ids": [
                        "2136e5bfd125bb8b9d04ce255a18a7fe3b5412c3"
                    ],
                    "hash": "9c8f12c6ee5c9a06b945272fa0d85ffc727a6588"
                }
            }
        },
        {
            "type": "activities",
            "id": "568",
            "attributes": {
                "timestamp": "2016-12-14T08:55:26.092Z",
                "activity-type": "comment",
                "deployment": {
                    "id": "49-321",
                    "status": "success",
                    "creator": {
                        "email": "juho@lucify.com",
                        "name": "Juho Ojala",
                        "timestamp": "2016-11-10T13:21:33.663Z"
                    },
                    "created-at": "2016-11-10T13:21:33.663Z",
                    "project-id": 49,
                    "finished-at": "2016-11-10T13:21:45.394Z",
                    "build-status": "success",
                    "project-name": "camel-visualization",
                    "extraction-status": "success",
                    "screenshot-status": "success",
                    "url": "https://staging-foo-branch-2-93501387-49-321.minard.io",
                    "screenshot": "https://staging.minard.io/charles/screenshot/49/321?token=063d5bf3c97eeb1924b49e91bccf41b8ae7beac370d5a60da3d70c217d1834c0"
                },
                "project": {
                    "id": "49",
                    "name": "camel-visualization"
                },
                "branch": {
                    "id": "49-foo-branch-2",
                    "name": "foo-branch-2"
                },
                "commit": {
                    "id": "49-9350138723ceefe3f924b512548cfea4d313258e",
                    "author": {
                        "name": "Juho Ojala",
                        "email": "juho@lucify.com",
                        "timestamp": "2016-11-10T15:21:20.000+02:00"
                    },
                    "message": "test-14\n",
                    "short-id": "93501387",
                    "committer": {
                        "name": "Juho Ojala",
                        "email": "juho@lucify.com",
                        "timestamp": "2016-11-10T15:21:20.000+02:00"
                    },
                    "parent-ids": [
                        "cce4562b33178436acf44b3b4cb801baf2bf3f41"
                    ],
                    "hash": "9350138723ceefe3f924b512548cfea4d313258e"
                },
                "comment": {
                    "name": "Juho Ojala",
                    "email": "juho@lucify.com",
                    "message": "asgdasfdasfsda",
                    "id": "33"
                }
            }
        },
    ]
}
```
