# Authentication

Charles uses Auth0 as the identity provider (IDP) and currently only accepts
Auth0 username-password based authentication. While Auth0 does provide integrations
with multiple 3rd party IDPs, like GitHub, Google and Facebook, these are so far unsupported.

Requests to charles's different endpoints are authenticated using an access token in the
JWT (Json Web Token) format. The access token is provided either in the `Authorization`
header, in a cookie or as a query string parameter, depending on the endpoint in question.

## JWT requirements

Auth0 supports different [*OAuth 2 flows*](https://auth0.com/docs/api-auth/which-oauth-flow-to-use)
for [*API authorization*](https://auth0.com/docs/apis), which result in obtaining an access token
for the specified api. In addition to verifying the access token with RS256,
the following checks are made for the JWT claims:

- `aud` must match the `AUTH0_AUDIENCE` (or, if not defined, the `EXTERNAL_BASEURL`) environment variable
- `iss` must match the `AUTH0_DOMAIN` environment variable
- `alg` must match `RS256`
- `exp` must be in the future

## API

The API endpoints, i.e. requests under `/api/`, require the JWT
as a `Bearer` token in the `Authorization` header. Assuming the token to be
stored in the variable `$TOKEN`, a request for team 1's projects would look like

```shell
curl -v -H "Authorization: Bearer $TOKEN" https://localtest.me:8000/teams/1/relationships/projects
```

## Deployments

To be able to access deployments in an authenticated manner, the JWT needs to be provided in a cookie.
Here's an example:

```shell
curl -v -H "Cookie: token=$TOKEN" http://master-4ab14192-143-94.deployment.localtest.me:8000/index.html
```

When accessing the `/team` or `/signup` endpoints, which require header based authentication, charles sets this cookie.

## Realtime

Finally, the Server Sent Events endpoint requires the token as a query string parameter. For example:

```shell
curl -v -H "Accept: text/event-stream" "http://localtest.me:8000/events/187?token=$TOKEN"
```

# Authorization

Team members *always* have full read / write access to the team's projects. In addition,
they are able to *view* the previews of any of the so called 'open' teams.

An open team is any team listed in the `OPEN_TEAM_NAMES` environment variable
(multiple team names can be specified with ',' as the separator). An open team's
previews are accessible without any authentication.
