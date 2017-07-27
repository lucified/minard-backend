import { Observable } from '@reactivex/rxjs';
import fetch from 'node-fetch';
import 'reflect-metadata';
import { inspect } from 'util';
import CharlesClient from '../src/integration-test/charles-client';
import {
  getAccessToken,
  getConfiguration,
} from '../src/integration-test/utils';
import {
  getGitHubAppInstallationAccessToken,
  getGitHubAppJWT,
} from '../src/notification/github-notify';
const teamId = 3;
export async function migrate() {
  const stagingConfig = await getConfiguration('staging');
  const productionConfig = await getConfiguration('production');
  const staging = new CharlesClient(
    stagingConfig.charles,
    await getAccessToken(stagingConfig.auth0.admin),
    true,
    true,
  );
  const production = new CharlesClient(
    productionConfig.charles,
    await getAccessToken(productionConfig.auth0.admin),
    true,
    true,
  );
  const stagingProjects = await staging
    .getProjects(teamId)
    .then(x => x.getEntities());
  const productionProjects = await production
    .getProjects(teamId)
    .then(x => x.getEntities());
  const productionNames = productionProjects.map(p => p.attributes.name);

  const toBeCreated = stagingProjects.filter(
    p => !productionNames.includes(p.attributes.name),
  );
  await Observable.from(toBeCreated)
    .flatMap(p => {
      const { name, description } = p.attributes;
      console.log('Creating %s', name);
      return production
        .createProject(name, description || '', teamId)
        .then(r => r.getEntity());
    }, 3)
    .do(r => console.log('Created %s', r.attributes.name))
    .toPromise();
}
export async function setGitHub() {
  const productionConfig = await getConfiguration('production');
  const production = new CharlesClient(
    productionConfig.charles,
    await getAccessToken(productionConfig.auth0.admin),
    true,
    true,
  );
  const productionProjects = await production
    .getProjects(teamId)
    .then(x => x.getEntities());
  const {
    githubInstallationId,
    githubAppId,
    githubAppPrivateKey,
  } = productionConfig.notifications!.github!;
  const jwt = await getGitHubAppJWT(githubAppId, githubAppPrivateKey);
  const token = (await getGitHubAppInstallationAccessToken(
    githubInstallationId,
    jwt,
  )).token;
  let page = 1;
  let response: { name: string }[] | undefined;
  let githubRepos: { name: string }[] = [];
  do {
    response = await getRepos(page, token);
    if (response) {
      githubRepos = githubRepos.concat(response);
      page++;
    }
  } while (page <= 3);

  const toBeCreated = productionProjects.filter(
    p => githubRepos.find(g => g.name === p.attributes.name) !== undefined,
  );
  const manual = productionProjects.filter(
    p => githubRepos.find(g => g.name === p.attributes.name) === undefined,
  ).map(p => p.attributes.name);

  const results = await Observable.from(toBeCreated)
    .flatMap(p => {
      const { name } = p.attributes;
      console.log('Setting up %s', name);
      const charlesPromise = production.configureNotification({
        type: 'github',
        projectId: Number(p.id),
        githubOwner: 'lucified',
        githubRepo: name,
      });
      const githubResponse = fetch(
        `https://api.github.com/repos/lucified/${name}/hooks`,
        {
          method: 'POST',
          headers: {
            authorization: `token <<PAT>>`,
          },
          body: JSON.stringify({
            name: 'web',
            active: true,
            events: ['push'],
            config: {
              url: p.attributes['webhook-url'],
              content_type: 'json',
            },
          }),
        },
      ).then(r => r.json());

      return Promise.all([charlesPromise, githubResponse]).then(r => ({
        name,
        charlesReponse: r[0].status,
        githubResponse: r[1].errors ? r[1].errors[0].message : r[1].config,
      }));
    }, 3)
    .do(r => console.log('%s: %o', r.name, r.githubResponse))
    .toArray()
    .toPromise();

  return {
    results,
    manual,
  };
}
setGitHub().then(r => console.log(inspect(r, false, 5, true)), console.log);

async function getRepos(page: number, token: string) {
  const response = await fetch(
    `https://api.github.com/orgs/lucified/repos?page=${page}`,
    {
      headers: {
        authorization: `token ${token}`,
      },
    },
  );
  if (response.status !== 200) {
    // throw new Error(`Invalid response: ${response.status}`);
    return undefined;
  }
  return (await response.json()) as { name: string }[];
}
