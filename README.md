
# Minard backend

The backend consists of the following services:

- charles (the code in this repo)
- [Forked GitLab CE](https://github.com/lucified/gitlab-ce)
- [Forked GitLab Runner](https://github.com/lucified/minard-runner)
- Redis
- Postgresql

charles is written in Typescript 2 and runs a [Hapi.js](http://hapijs.com) based node server.

# Requirements

[Docker for Mac](https://docs.docker.com/docker-for-mac/)

# Running

Since it's all Docker, just run the following in the project root:

```
docker-compose up
```

After the bootup process completes, which can take a while, you can login to GitLab at
`http://localhost:10080`. Similarly, the git ssh backend for pushing and pulling repositories
is at `http://localhost:10022`.

## First run

When first run, this will build a Docker image for charles and pull the rest from Docker
Hub. Beware that this operation requires some bandwidth/patience, since building the image
runs `npm install` and the Gitlab Docker image is quite large.

Bringing all the services up on the first run can take quite a while (some minutes) and the
console will fill up with nasty looking error messages. These are caused by the services
trying to access each other before they are fully up.


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

## Test data

To get up to speed quickly with a couple of projects and some deployments, you can run the
`fetch-test-data.sh` script, which downloads a complete `gitlab-data` folder from AWS S3.
Before running, make sure you are properly authorized by following the instructions in
[lucify-infra#setup-credentials](https://github.com/lucified/lucify-infra#setup-credentials).

The test data has a GitLab user `root` with password `12345678`. After logging in, be sure to set
your own [public key in GitLab](http://docs.gitlab.com/ce/gitlab-basics/create-your-ssh-keys.html).

# Development (in Docker)

If you need to rebuild the charles image (to e.g. run `npm install` after requiring new libraries),
run the following:

```shell
docker-compose build charles
```

# Development (outside of Docker)

Install charles's dependencies on the host with
```bash
nvm use
npm install -g tslint node-dev typescript@beta
npm install
npm link typescript
npm link tslint
```

Start GitLab, Redis, Postgresql and one `gitlab-runner` with:

```shell
./compose-infra
```

Start charles
```
npm run dev
```

This will start charles with [`node-dev`](https://github.com/fgnass/node-dev), which restarts
the server whenever the files under `dist` change.

To get continous transpilation, run the following in the project root (in another tab):

```shell
tsc -w
```

### Caveats

Currently you need to be connected to a network for the communication between Docker
containers and the host machine to work correctly.

## Debugging

A launch configuration for debugging in Visual Studio Code is included under `.vscode`.
If the server has was started with `npm run dev`, the debugger should be able to attach
to the process.
