# Administration

Charles supports a special 'admin' account, which is intended
to be used with the provided `charles-client` cli tool.

## Configuring the admin account

To enable charles's admin account, you should create a new *non-interactive*
client in your Auth0 account. The admin account used by `charles-client` is
the same one as used by the integration tests, so please follow the instructions for
configuring 'System integration tests' in [testing](testing.md).

Finally, the admin client's 'Client ID' needs to specified
as the `ADMIN_ID` environment variable.

## Team tokens

To generate a new team token (invalidating any existing ones) for team 'foo':

```shell
yarn run charles-client generateTeamToken -- foo
```

To fetch an existing team token for team 'foo':

```shell
yarn run charles-client getTeamToken -- foo
```

## Regerating GitLab passwords

```shell
yarn run charles-client regenerateGitlabPasswords
```
