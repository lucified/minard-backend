
# Notifications API

## Add notification configuration

### Request

- Method: `POST`
- URL: `/api/Notifications`

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

- Response status is `201` when notification is successfully created.

Response body:
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

- Method: `POST`
- URL: `/api/notifications/:id`
- Payload: empty

