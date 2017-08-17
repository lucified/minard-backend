
# Notification API

The notification API deals with JSON API notification resources.
Notification resources represent notification settings that
apply either to a [project](api-project.md) or a team.

Notification resources have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`type`|"flowdock"&#124;"hipchat"&#124;"slack"&#124;"github"|Type of activity
`team-id`|number|Project id (only for team-scoped notifications)
`project-id`|string|Project id (only for project-scoped notifications)
`flow-token`|string|Flow token (only for `flowdock`)
`hipchat-auth-token`|string|Hipchat authorization token (only for `hipchat`)
`hipchat-room-id`|number|Hipchat room id (only for `hipchat`)
`slack-webhook-url`|string|Slack webhook URL (only for `slack`)
`github-owner`|string|GitHub organization that owns the repo (only for project-level `github`)
`github-repo`|string|Name of the GitHub repo (only for project-level `github`)
`github-app-id`|number|The GitHub app ID (only for team-level `github`)
`github-app-private-key`|string|The GitHub app private key (only for team-level `github`)
`github-installation-id`|number|The GitHub app installation id (only for team-level `github`)

## Get team-scoped notification configurations

### Request

- Method: `GET`
- URL: `/api/teams/:teamId/relationships/notification`

### Response

Returns a JSON API response object, where the `data` key is an array of JSON API entities, for example

```json
{
  "data":
  [
    {
      "data": {
        "id": 5,
        "type": "notifications",
        "attributes": {
          "type": "hipchat",
          "team-id": 12345,
          "hipchat-auth-token": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
          "hipchat-room-id": "[YOUR_HIP_CHAT_ROOM_ID]"
        }
      }
    }
  ]
}
```

The notification type related attributes are described below in *Add notification configuration*.

## Get project-scoped notification configurations

### Request

- Method: `GET`
- URL: `/api/projects/:projectId/relationships/notification`

### Response

Returns a JSON API response object, where the `data` key is an array of JSON API entities, for example

```json
{
  "data":
  [
    {
      "data": {
        "id": 4,
        "type": "notifications",
        "attributes": {
          "type": "flowdock",
          "project-id": "[PROJECT_ID]",
          "flow-token": "[FLOW_TOKEN]"
        }
      }
    }
  ]
}
```


The notification type related attributes are described below.

## Add notification configuration

### Request

- Method: `POST`
- URL: `/api/notifications`

Payload for project-scoped Flowdock notifications:
```json
{
  "data": {
    "type": "notifications",
    "attributes": {
      "type": "flowdock",
      "project-id": "[PROJECT_ID]",
      "flow-token": "[FLOW_TOKEN]"
    }
  }
}
```

Payload for project-scoped HipChat notifications:
```json
{
  "data": {
    "type": "notifications",
    "attributes": {
      "type": "hipchat",
      "project-id": "[YOUR_PROJECT_ID]",
      "hipchat-auth-token": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchat-room-id": "[YOUR_HIP_CHAT_ROOM_ID]"
    }
  }
}
```

Payload for team-scoped HipChat notifications:
```json
{
  "data": {
    "type": "notifications",
    "attributes": {
      "type": "hipchat",
      "team-id": [YOUR_TEAM_ID],
      "hipchat-auth-token": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchat-room-id": "[YOUR_HIP_CHAT_ROOM_ID]"
    }
  }
}
```

Payload for project-scoped Slack notifications:
```json
{
  "data": {
    "type": "notifications",
    "attributes": {
      "type": "slack",
      "project-id": "[YOUR_PROJECT_ID]",
      "slack-webhook-url": "[YOUR_SLACK_WEBHOOK_URL]"
    }
  }
}
```

### Response

Returns a JSON API object with a single notification
resource corresponding to the one that was created.
Response code is `201`.

*Example response body:*
```json
{
  "data": {
    "id": 5,
    "type": "notifications",
    "attributes": {
      "type": "hipchat",
      "team-id": [YOUR_TEAM_ID],
      "hipchat-auth-token": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchat-room-id": "[YOUR_HIP_CHAT_ROOM_ID]"
    }
  }
}
```

## Delete notification configuration

- Method: `DELETE`
- URL: `/api/notifications/:id`
- Payload: empty
