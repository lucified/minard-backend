
# Minard backend

The backend consists of the following services:

- charles (the code in this repo)
- [Forked GitLab CE](https://github.com/lucified/gitlab-ce)
- [Forked GitLab Runner](https://github.com/lucified/minard-runner)
- Redis
- Postgresql

charles is written in Typescript 2 and runs a [Hapi.js](http://hapijs.com) based node server.

## Requirements

[Docker for Mac](https://docs.docker.com/docker-for-mac/)

## Running

Since it's all Docker, just run the following in the project root:

```
docker-compose up
```

Alternatively you can run the following script, which will take care
of stopping any previous `docker-compose` and clean up some runner-related
temporary files.

```
./compose-all
```

After the bootup process completes, which can take a while, you can login to GitLab at
`http://localhost:10080`. Similarly, the git ssh backend for pushing and pulling repositories
is at `http://localhost:10022`.

### First run

When first run, this will build a Docker image for charles and pull the rest from Docker
Hub. Beware that this operation requires some bandwidth/patience, since building the image
runs `npm install` and the Gitlab Docker image is quite large.

Bringing all the services up on the first run can take quite a while (some minutes) and the
console will fill up with nasty looking error messages. These are caused by the services
trying to access each other before they are fully up.


### Mounted directories

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

### Rebuild image

If you update charles and need to e.g. install new NPM libraries, you will need to rebuild the
charles Docker image. This can be done with:

```shell
docker-compose build charles
```

### Test data

To get up to speed quickly with a couple of projects and some deployments, you can run the
`fetch-test-data.sh` script, which downloads a complete `gitlab-data` folder from AWS S3.
Before running, make sure you are properly authorized by following the instructions in
[lucify-infra#setup-credentials](https://github.com/lucified/lucify-infra#setup-credentials).

The test data has a GitLab user `root` with password `12345678`. After logging in, be sure to set
your own [public key in GitLab](http://docs.gitlab.com/ce/gitlab-basics/create-your-ssh-keys.html).

## Development (outside of Docker)

### Charles's dependencies

```bash
nvm use
npm install -g tslint node-dev typescript@beta
npm install
npm link typescript
npm link tslint
```

### Dnsmasq

Setup and fixed special IP loopback address with
```bash
sudo ifconfig lo0 alias 10.77.88.99
```
You will need to do this after every restart of your computer.

Install and configure `dnsmasq`
```bash
brew install dnsmasq
echo 'address=/.ldev/10.77.88.99' >> /usr/local/etc/dnsmasq.conf
echo 'nameserver 127.0.0.1' > /etc/resolver/ldev
brew services restart dnsmasq
```

Add the following environment line to `.zshrc` or `.bashrc`
```bash
export HOST_LOOPBACK_IP=10.77.88.99
```

### Starting

Start GitLab, Redis, Postgresql and one `gitlab-runner` with:

```shell
./compose-infra
```

Start charles
```
DEBUG_PORT=5859 npm run dev
```

This will start charles with [`node-dev`](https://github.com/fgnass/node-dev), which restarts
the server whenever the files under `dist` change. We override the debug port with the
environment variable to avoid a port conflict with docker.

To get continous transpilation, run the following in the project root (in another tab):

```shell
tsc -w
```

## Deployment

If not installed, install ecs-upd8r
```bash
npm install ecs-updater
```

Run the deployment with:
```bash
AWS_PROFILE=lucify-protected npm run-script deploy
```
For this to work, you must have the `lucify-protected` profile
configured in your AWS credentials (`~/.aws/credentials`).

## Debugging

A launch configuration for debugging in Visual Studio Code is included under `.vscode`.
If the server has was started with `npm run dev`, the debugger should be able to attach
to the process.

## Tests

Run unit tests with
```
npm test
````

Start all needed services locally and run system integration tests against them with
```
npm run-script system-test
```

Run system integration tests against an already running local backend with
```
npm run-script system-test-mocha
```

You can run system integration tests against a custom backend with
```
CHARLES=$CHARLES_BASEURL_QA MINARD_GIT_SERVER=$GIT_SERVER_QA npm run-script system-test-mocha
```

For this to work, you need to have `CHARLES_BASEURL_QA` and `MINARD_GIT_SERVER` environment
variables set. `MINARD_GIT_SERVER` is the base url for the server hosting the Minard git repos.

## Monitoring

A simple monitoring endpoint is available at `/status`.

## Maintenance tasks

You can trigger checking of screenshots by going to the url `/operations/check-screenshots`.
This will make sure that all successful and extracted deployments have screenshots.
Normally screenshots are generated after each deployment, but this maintenance task
may sometimes be useful.
