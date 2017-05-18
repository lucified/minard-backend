# Prerequisites

The integration tests require a configuration file, `src/integration-test/configuration.{environment}.ts` for each environment
you want to run the tests against. The
environment can be 'development' (default), 'staging' or 'production' and it is determined by the `NODE_ENV` environment variable.

The configuration file should conform to:
```typescript
interface Config {
  charles: string;
  notifications: {
    flowdock?: {
      type: 'flowdock';
      flowToken: string;
    },
    hipchat?: {
      type: 'hipchat';
      hipchatRoomId: number;
      hipchatAuthToken: string;
    },
    slack?: {
      type: 'slack';
      slackWebhookUrl: string;
    },
  };
  auth0: {
    regular: Auth0 & { gitPassword: string };
    open: Auth0 & { gitPassword: string };
    admin: Auth0 & { gitPassword: string };
  };
}
interface Auth0 {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}
```

An example file can be found from `src/integration-test/configuration.{environment}.ts`.

The integration tests assume that a predefined set of "users" have been created in Auth0 and linked with
corresponding user accounts and groups in GitLab.  To be able to get up and running from scratch remains a TODO.

## Auth0 configuration

We currenty have three kinds of teams: *regular*, *open* and *admin*.
A new non interactive client needs to be created for each of these.

In the clients' advanced configuration, the *JsonWebToken Signature Algorithm*
should be set to 'RS256' and *OIDC conformant* should be checked. In the APIs
section, make sure that the clients are authorized to access charles.

Copy the `clientId` and `clientSecret` together with the `domain` (Auth0 API endpoint) and the `audience` (charles)
to the integration test configuration file described above.

## GitLab configuration

Create three new groups, 'integration-test', 'integration-test-open' and 'integration-test-admin'.
Add a user to each of these and set the username to `{clientId}-clients` where clientId
is the id of the corresponding Auth0 client.

## Charles's configuration

Make sure that the `OPEN_TEAM_NAMES` environment variable includes 'integration-test-open' and that
the `ADMIN_TEAM_NAME` environment variable is set 'integration-test-admin'.

# Running the tests

If running against a local backend start it with
```shell
./compose-all
```

Run system integration tests with
```shell
NODE_ENV={env} npm run-script system-test
```
where `env` is 'development', 'staging' or 'production'.
