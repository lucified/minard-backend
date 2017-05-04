
# Notification API

The notification API deals with JSON API notification resources.
Notification resources represent notification settings that
apply either to a [project](api-project.md) or a team.

Notification resources have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`type`|"flowdock"&#124;"hipchat"&#124;"slack"|Type of activity
`team-id`|string|Project id (only for team-scoped notifications)
`project-id`|string|Project id (only for project-scoped notifications)
`flow-token`|string|Flow token (only for `flowdock`)
`hipchat-auth-token`|string|Hipchat authorization token (only for `hipchat`)
`hipchat-room-id`|string|Hipchat room id (only for `hipchat`)
`slack-webhook-url`|string|Slack webhook URL (only for `slack`)

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
      "projectId": "[PROJECT_ID]",
      "flowToken": "[FLOW_TOKEN]"
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
      "projectId": "[YOUR_PROJECT_ID]",
      "hipchatAuthToken": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchatRoomId": "[YOUR_HIP_CHAT_ROOM_ID]"
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
      "teamId": "[YOUR_TEAM_ID]",
      "hipchatAuthToken": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchatRoomId": "[YOUR_HIP_CHAT_ROOM_ID]"
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
      "projectId": "[YOUR_PROJECT_ID]",
      "slackWebhookUrl": "[YOUR_SLACK_WEBHOOK_URL]"
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
      "teamId": "[YOUR_TEAM_ID]",
      "hipchatAuthToken": "[YOUR_HIP_CHAT_AUTH_TOKEN]",
      "hipchatRoomId": "[YOUR_HIP_CHAT_ROOM_ID]"
    }
  }
}
```

## Delete notification configuration

- Method: `DELETE`
- URL: `/api/notifications/:id`
- Payload: empty
