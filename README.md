
# Minard backend

The backend consists of the following services:

- Minard monolith (the code in this repo)
- Gitlab
- Gitlab runner
- Redis
- Postgresql

## Minard monolith

The Minard node/hapi backend. Written in Typescript 2.0.

## Requirements

[Docker for Mac](https://docs.docker.com/docker-for-mac/)

```bash
nvm use
npm install -g node-dev typescript@beta
npm install
npm link typescript
```

## Development


To bring up the whole system

```bash
docker-compose up
```

To only start Minard monolith:
```
docker-compose run --no-deps --service-ports minard-monolith
```

The `src`, `test` and `dist` folders are mounted inside the container and
[`node-dev`](https://github.com/fgnass/node-dev) is used to restart the
server whenever the sources under `dist` change. To get continous transpilation,
also run

```bash
tsc -w
```

in the project root (in another tab).

## Debugging

A launch configuration for remote debugging in Visual Studio Code is included
under `.vscode`. See https://blog.docker.com/2016/07/live-debugging-docker/ for
instructions.