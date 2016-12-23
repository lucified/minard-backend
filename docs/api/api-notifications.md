
# Notification API

The notification API deals with JSON API notification resources,
which have the following attributes:

*Attributes*:

Name|Type|Description
----|----|-----------
`type`|string|Type of activity. Valid values are "flowdock" and "hipchat"
`team-id`|string|Project id (only for team-scoped notifications)
`project-id`|string|Project id (only for project-scoped notifications)
`flow-token`|string|Flow token (only for `flowdock`)
`hipchat-auth-token`|string|Hipchat authorization token (only for `flowdock`)
`hipchat-room-id`|string|Hipchat room id(only for `hipchat`)

## Add notification configuration

### Request

- Method: `POST`
- URL: `/api/notifications`

Payload for project-scoped Flowdock notification:
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

Payload for project-scoped HipChat notification
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

Payload for team-scoped HipChat notification
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
