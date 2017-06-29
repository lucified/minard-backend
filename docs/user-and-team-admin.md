
# User and team administration

Teams are mapped to GitLab groups. The first group that is created in GitLab has an ID of `2`,
and so on. You can manage GitLab groups by logging into GitLab with root credentials.

When running the local development server, GitLab is accessed at `http://localhost:10080`.
When running in production, the address depends on the production setup.

## Creating teams

Charles doesn't yet support team management. To create or modify teams, you should
log directly to GitLab with an admin account and make the modifications.

After the team has been created, to sign users into a team, you need to generate
a *team token* (see [admin](admin.md) for how to configure the cli):

```
yarn run charles-client generateTeamToken -- footeam
```

## Signup

Users in GitLab need to be mapped to users in Auth0, which is accomplished by mapping the GitLab usernames to Auth0's user ids.
A user must also belong into a (only one) team. For this reason users should not be created directly in GitLab.

Signing up follows the OAuth2 protocol and can, in general, only be done interactively (the user must log in to Auth0 with
her credentials).

Signing up is done with the `/signup` endpoint by passing an access token in the request headers (see [auth](auth.md)).
The access token must have a custom claim, currently fixed to be `https://minard.io/team_token`, specifying the team token.





