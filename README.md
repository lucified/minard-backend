
# Minard backend

This is the repository for the Minard backend. The project is in a
prototype stage and under active development.

[Minard](https://www.lucify.com/minard) is a preview service that
integrates with version control, automatically
building and deploying each version of your project. Minard makes it easy
to share functional versions of quick web projects for feedback.

The backend consists of many services that are composed together
to form the Minard backend. This repository contains only the code
for the main backend service, `charles`, whereas the code for other
backend services are in their own repositories.

In addition to `charles`, the backend consists of the following services:

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
- [Charles API](docs/api/README.md)
- [User and team administration](docs/user-and-team-admin.md)
- [Production setup](docs/production-setup.md)
- [Contributing](docs/contributing.md)
- [License](docs/license.md)
- [Internal](docs/internal.md) (Internal documentation for Lucify)

## Acknowledgements

Thank you to the [Google Digital News Inititiative](https://www.digitalnewsinitiative.com/) and
[Helsingin Sanomat Foundation](http://www.hssaatio.fi/en/) for supporting our work
on the Minard prototype.
