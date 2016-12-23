
# Charles API

The API consists of two parts, the REST API and the Streaming API.

## Rest API

Unless otherwise noted, the REST API follows the [JSON API](http://jsonapi.org/) specification.
Requests for fetching, creating and updating different types of resources are documented
by resource type:

- [Activity](api-activity.md)
- [Branch](api-branch.md)
- [Commit](api-commit.md)
- [Comment](api-comment.md)
- [Deployment](api-deployment.md)
- [Notification](api-notification.md)
- [Project](api-project.md)
- [Preview](api-preview.md)

See the [errors section](http://jsonapi.org/format/#errors) in the JSON API
documentation for information on error responses.

## Streaming API

The [Streaming API](api-streaming.md) provides support for realtime updates based on
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
