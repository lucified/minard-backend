
# Comment API

The comment API deals with JSON API comment resources.
Comment resources represent comments that users have
added to [deployments](api-deployment.md).

Comment resources have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`name`|string|Project name (max. 220 characters)
`deployment`|string|Id of related deployment
`message`|string|Message contents
`email`|string|Commenter email address
`name?`|string|Commenter name

## Get comments for deployment

### Request

- Method: `GET`
- URL: `api/comments/deployment/:id`

### Response

Returns JSON API object including a collection of comment resources.

*Example:*
```json
{
    "data": [
        {
            "type": "comments",
            "id": "35",
            "attributes": {
                "email": "juho@lucify.com",
                "name": "Juho Ojala",
                "message": "one more comment",
                "deployment": "49-321",
                "created-at": "2016-12-14T19:17:14.396Z"
            }
        },
        {
            "type": "comments",
            "id": "33",
            "attributes": {
                "email": "juho@lucify.com",
                "name": "Juho Ojala",
                "message": "asgdasfdasfsda",
                "deployment": "49-321",
                "created-at": "2016-12-14T08:55:26.092Z"
            }
        }
    ]
}
```
