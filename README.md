
# Minard backend

This is the repository for the Minard backend.
Minard is in a prototype stage and
under active development.

The backend consist of many services that are composed together
to form the Minard backend. This repository contains only the code
for the main backend service, `charles`, whereas the code for other
backend services are in their own repositories.

The backend consists of the following services:

- charles
- [Forked GitLab CE](https://github.com/lucified/gitlab-ce)
- [Forked GitLab Runner](https://github.com/lucified/minard-runner)
- [Screenshotter](https://github.com/lucified/screenshotter)
- [Redis](https://redis.io/)
- [Postgresql](https://www.postgresql.org/)

The backend is intended to be run
together with [minard-ui](https://github.com/lucified/minard-ui).

## Documentation

- [Motivation](docs/motivation.md)
- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [API](docs/api/README.md)
- [User and team administration](docs/user-and-team-administration.md)
- [Production setup](docs/production.md)
- [Contributing](docs/contributing.md)
- [License](docs/license.md)

## Thanks

Thanks to Google Digital News Inititiative and
Helsingin Sanomat foundation for supporting our work
on the Minard prototype.
