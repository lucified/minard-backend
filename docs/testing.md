
# Tests

## Unit tests

Run unit tests with
```shell
npm test
```

All unit tests are named with the pattern `foo-spec.ts`. The test
files are located in the same directory as the code to be tested.

## System integration tests

### Prerequisities

System integration tests require that there is a team with id `2`,
which should be reserved only for running integration tests.

Use the GitLab UI at `http://localhost:10080` to create the team. You can override
the id by running system integration tests using the `TEAM_ID` environment variable.

### Running tests

Start all needed services locally and run system integration tests against them with
```shell
npm run-script system-test
```

Run system integration tests against an already running local backend with
```
npm run-script system-test-mocha
```shell

You can run system integration tests against a custom backend with
```shell
CHARLES=$CHARLES_BASEURL_QA MINARD_GIT_SERVER=$GIT_SERVER_QA npm run-script system-test-mocha
```

For this to work, you need to have `CHARLES_BASEURL_QA` and `MINARD_GIT_SERVER` environment
variables set. `MINARD_GIT_SERVER` is the base url for the server hosting the Minard git repos.
