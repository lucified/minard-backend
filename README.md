
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

Start GitLab, Redis, Postgresql and one `gitlab-runner` with:
```shell
source ./get-monolith-ip
docker-compose up
```

There is also a separate script for that
```shell
./compose
```

Start Minard monolith
````
npm run dev
```

This will start the Minard monolith application with
[`node-dev`](https://github.com/fgnass/node-dev), which restarts
the server whenever the files under `dist` change.

To get continous transpilation, run
```bash
tsc -w
```
in the project root (in another tab).

## Caveats

Currently you need to be connected to a network for the communication between
docker containers and the host machine to work correctly.

## Debugging

A launch configuration for debugging in Visual Studio Code is included
under `.vscode`. If the server has was started with `npm run dev`, the debugger should
be able to attach to the process.
