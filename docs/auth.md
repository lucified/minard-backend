# Authentication

Charles uses Auth0 as the identity provider (IDP) and currently only accepts
Auth0 username-password based authentication. While Auth0 does provide integrations
with multiple 3rd party IDPs, like GitHub, Google and Facebook, these are so far unsupported.

Requests to charles's different endpoints are authenticated using Json Web Tokens (JWTs), which
are provided either in the `Authorization` header, in a cookie or as a query string parameter, depending
on the endpoint in question.

## API

The API endpoints, i.e. requests under `/api/`, require the JWT
as a `Bearer` token in the `Authorization` header. Assuming the token to be
stored in the variable `$TOKEN`, a request for team 1's projects would look like

```shell
curl -v -H "Authorization: Bearer $TOKEN" https://localtest.me:8000/teams/1/relationships/projects
```

## Deployments

To be able to browse deployments in an authenticated manner, the JWT needs to be provided in a cookie.
Here's an example:

```shell
curl -v -H "Cookie: token=$TOKEN" http://master-4ab14192-143-94.deployment.localtest.me:8000/index.html
```

## Realtime

Finally, the Server Sent Events endpoint requires the token as a query string parameter. For example:

```shell
curl -v -H "Accept: text/event-stream" "http://localtest.me:8000/events/187?token=$TOKEN"
```
