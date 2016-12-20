
# Lucify's internal documentation

This file contains documentation related to
Lucify's internal setup for running Minard.
They are intended only for Lucify's internal use.

## Setup

In local development, the environment variable `LUCIFY` should be set.

## Deployments

The deployment environments are as follows:
- staging: `https://charles-staging.lucify.com`
- production: `https://charles.lucify.com`

### Locally

Run the deployment with:
```bash
AWS_PROFILE=lucify-protected \
FLOWDOCK_FLOW_TOKEN=$FLOW_MAIN \
FLOWDOCK_AUTHOR_NAME=$FLOWDOCK_AUTHOR \
npm run deploy
```
For this to work, you must have the `lucify-protected` profile
configured in your AWS credentials (`~/.aws/credentials`).

This will deploy `charles` to the staging environment.

### Via continuous integration (staging)

Once pull requests are merged to master in GitHub, on the condition
that the tests pass, CircleCI will deploy to `staging` automatically.

### Devops (production)

After the deployment has been tested in `staging` and deemed suitable,
a `production` deployment can be initiated from Flowdock with
```
lucifer deploy minard-backend to production <OTP>
````
where `OTP` is the AWS MFA one time password.

## GitLab addreses

- Staging: `https://git-staging.minard.io/`
- Production: `https://git.minard.io/`

## Monitoring

A simple status check of the services Charles depend on is available at `/status`.

Additionally we use Datadog as our monitoring solution.
The staging or Q/A dashboard can be
viewed at https://p.datadoghq.com/sb/cc26c9abc-333b7040d3.

## Logs

All the logs get pushed to AWS CloudWatch Logs via Docker (native support). These can be viewed
from the AWS Console, but a better alternative is using [awslogs](https://github.com/jorgebastida/awslogs)
from the command line. As an example, to get auto-updating logs for charles (assuming authorization):

```shell
awslogs get minard-charles --start='2h ago' -w
```

## Maintenance tasks

You can trigger checking of screenshots by going to the url `/operations/check-screenshots`.
This will make sure that all successful and extracted deployments have screenshots.
Normally screenshots are generated after each deployment, but this maintenance task
may sometimes be useful.
