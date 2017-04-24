
# Tests

## Unit tests

The backend has more than 250 unit tests. Run them with
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

Start the backend locally
```shell
INTEGRATION_TEST=true ./compose-all
```

Run system integration tests
```shell
npm run-script system-test
```

You can run system integration tests against a custom backend with
```shell
CHARLES=$CHARLES_BASEURL_QA MINARD_GIT_SERVER=$GIT_SERVER_QA npm run-script system-test
```

For this to work, you need to have `CHARLES_BASEURL_QA` and `MINARD_GIT_SERVER` environment
variables set. `MINARD_GIT_SERVER` is the base url for the server hosting the Minard git repos.
