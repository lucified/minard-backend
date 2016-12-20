
# Development

The documentation is written for OS X, but
is should be easy to adapt the instructions
also for Linux.

## Requirements

- [Docker for Mac](https://docs.docker.com/docker-for-mac/)
- [AWS CLI](https://aws.amazon.com/cli/)
```bash
brew install awscli
```

## Initial data

To get up to speed quickly with a couple of projects and some deployments, you can run the
`fetch-test-data.sh` script, which downloads a complete `gitlab-data` folder from AWS S3.
The test data has a GitLab user `root` with password `12345678`.

If you do not use this script, you will
need to [manually create](user-and-team-admin.md) at least
two teams using the GitLab UI.

## Running

Since it's all Docker, just run the following in the project root:

```
docker-compose up
```

Alternatively you can run the following script, which will take care
of stopping any previous `docker-compose` and clean up some build
runner -related temporary files.

```
./compose-all
```

The bootup process can take a while. During the process there
may be some error messages that are caused by some services
trying to access other services that have not started yet.

After the bootup process completes, the following
services are available:
- GitLab: `http://localhost:10080`, password `123456789` for user `root`.
- Charles: `http://localhost:8000`
- Git server: `http://localhost:10022`
- Postgres: port `15432`, password `123456789` for user `gitlab`. Main databases are called `charles` and `gitlabhq_production`.
- Redis: port `16379`

### First run

When first run, Docker will build an image for charles and pull the rest of the images
from Docker Hub. Beware that this operation requires some bandwidth/patience, since
building the image runs `npm install`, and the Gitlab Docker image is quite large.

## Mounted directories

By default (as specified in [docker-compose.override.yml](./docker-compose.override.yml)) the
containers mount data directories under `gitlab-data`. For example, the (bare) repository data
ends up residing in `gitlab-data/gitlab/repositories`.

After running for the first time, `gitlab-data` will end up looking like this:

```
gitlab-data
├── README.md
├── gitlab
│   ├── README.md
│   ├── backups
│   ├── builds
│   ├── config
│   ├── repositories
│   ├── shared
│   ├── ssh
│   ├── tmp
│   └── uploads
├── postgresql
│   ├── README.md
│   └── pgdata
├── redis
│   ├── README.md
│   └── dump.rdb
└── runner
    ├── README.md
    ├── config.toml
    └── config.toml.example
```

To start from scratch, you can do
```bash
rm -rf gitlab-data
git checkout master -- gitlab-data
```

## Running with UI

Normally it makes the sense to run [minard-ui](https://github.com/lucified/minard-ui)
along the backend services. See the documentation for minard-ui on how to
run it against your development backend.


## Rebuilding the image

If you update charles and need to e.g. install new NPM libraries, you will
need to rebuild the charles Docker image. This is done with:

```shell
docker-compose build charles
```

## Hot reloading

During development it is useful to continously transpile code and automatically restart
charles to reflect code changes.

Get this by running:
```shell
npm run watch
```

## Debugging

A `node-dev` debugger for `charles` is listening at `5858`. A launch
configuration for debugging in Visual Studio Code is included under `.vscode`.

