## GitHub

The integration with GitHub is done with *GitHub Apps*. We have created an organization
specific [app](https://github.com/organizations/lucified/settings/apps/minard)
which has access to the repos and can create deployments. It has an *installation*, configurable
at https://github.com/organizations/lucified/settings/installations/39422.

To authenticate as the installation, you need three pieces of information:

- the app id (3741)
- app's private key
- the installation id (39422)

You first create a JWT (Json Web Token) with the app id as the `iss` claim and sign
it with the private key. Now you can ask for an *access token* on behalf of a specific installation
by POSTing to `https://api.github.com/installations/${installationId}/access_tokens` with
the JWT as a Bearer token.


