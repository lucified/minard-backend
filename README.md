
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
```bash
docker-compose up
```

Start Minard monolith
````
npm run-script dev
```

This will start the Minard monolith application with
[`node-dev`](https://github.com/fgnass/node-dev), which restarts
the server whenever the files under `dist` change.

To get continous transpilation, run
```bash
tsc -w
```
in the project root (in another tab).

## Debugging

A launch configuration for remote debugging in Visual Studio Code is included
under `.vscode`. See https://blog.docker.com/2016/07/live-debugging-docker/ for
instructions.
