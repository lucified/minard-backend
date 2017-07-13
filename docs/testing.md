# Tests

## Unit tests

The backend has more than 250 unit tests. Run them with
```shell
npm test
```

All unit tests are named with the pattern `foo-spec.ts`. The test
files are located in the same directory as the code to be tested.

## System integration tests

### Prerequisites

The integration tests require a configuration file, `src/integration-test/configuration.{environment}.ts` for each environment
you want to run the tests against. The
environment can be 'development' (default), 'staging' or 'production' and it is determined by the `NODE_ENV` environment variable.
The configuration file is executed normally, but it has to default export a json object or a S3 URL pointing to a json file.

Here's an example:
```typescript
const config = {
  "charles": "http://localtest.me:8000",
  "notifications": {
    "flowdock": {
      "type": "flowdock",
      "flowToken": "xxx"
    },
    "hipchat": {
      "type": "hipchat",
      "hipchatRoomId": 123,
      "hipchatAuthToken": "xxx"
    },
    "slack": {
      "type": "slack",
      "slackWebhookUrl": "https://hooks.slack.com/services/xxx"
    }
  },
  "auth0": {
    "regular": {
      "audience": "http://localtest.me:8000",
      "domain": "https://company.eu.auth0.com",
      "clientId": "123",
      "clientSecret": "xxx"
    },
    "open": {
      "audience": "http://localtest.me:8000",
      "domain": "https://company.eu.auth0.com",
      "clientId": "456",
      "clientSecret": "xxx"
    },
    "admin": {
      "audience": "http://localtest.me:8000",
      "domain": "https://company.eu.auth0.com",
      "clientId": "789",
      "clientSecret": "xxx"
    }
  }
}
export default config;
```
or
```typescript
export default "s3://mybucket/configuration.staging.json"
```
The integration tests assume that a predefined set of "users" have been created in Auth0 and linked with
corresponding user accounts and groups in GitLab.  To be able to get up and running from scratch remains a TODO.

### Auth0 configuration

We currenty have three kinds of teams: *regular*, *open* and *admin*.
A new non interactive client needs to be created for each of these.

In the clients' advanced configuration, the *JsonWebToken Signature Algorithm*
should be set to 'RS256' and *OIDC conformant* should be checked. In the APIs
section, make sure that the clients are authorized to access charles.

Copy the `clientId` and `clientSecret` together with the `domain` (Auth0 API endpoint) and the `audience` (charles)
to the integration test configuration file described above.

## GitLab configuration

Create two new groups, 'integrationtest' and 'integrationtestopenteam'.
Add a user to each of these and set the username to `clients-{clientId}` where clientId
is the id of the corresponding Auth0 client. Additionally, create one more user, which
you don't need to add to any group. This will be the admin user.

After creating the groups and users, update the passwords for all users
by running:

```shell
charles-client regenerateGitlabPasswords
```

## Charles's configuration

# Prerequisites
Make sure the following environment variables have been set when starting charles:

```shell
ADMIN_ID=auth0ClientIdForAdminUser
```

# Running the tests

If running against a local backend, start it with
```shell
./compose-all
```

Run system integration tests with
```shell
NODE_ENV={env} yarn run system-test
```
where `env` is 'development', 'staging' or 'production'.
