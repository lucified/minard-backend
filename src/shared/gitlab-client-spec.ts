
import { expect } from 'chai';
import 'reflect-metadata';

import { get } from '../config';
import { fetchMock } from '../shared/fetch';
import { GitlabClient } from './gitlab-client';

const host = 'gitlab';

const getClient = () => get<GitlabClient>(GitlabClient.injectSymbol);

describe('gitlab-client', () => {

  describe('auth', () => {
    it('sets authentication if nothing provided', async () => {
      // Arrange
      const gitlabClient = getClient();
      const token = await gitlabClient.getToken();

      // Act
      const h = (await gitlabClient.authenticate()).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);

    });

    it('sets authentication if some headers provided', async () => {
      // Arrange
      const gitlabClient = getClient();
      const token = await gitlabClient.getToken();

      // Act
      const h = (await gitlabClient.authenticate({ headers: { a: 'b' } })).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal(token);
      expect(h.a).to.equal('b');

    });

    it('won\'t override authentication', async () => {
      // Arrange
      const gitlabClient = getClient();
      const opt = { headers: { [gitlabClient.authenticationHeader]: 'b' } };
      // Act
      const h = (await gitlabClient.authenticate(opt)).headers as any;

      // Assert
      expect(h[gitlabClient.authenticationHeader]).to.equal('b');

    });

  });

  describe('fetchJson', () => {
    it('gives back correct json', async () => {
      // Arrange
      interface Ijson {
        a: string;
        b: string;
      }
      const json: Ijson = {
        a: 'a',
        b: 'b',
      };
      const gitlabClient = getClient();
      fetchMock.restore().mock(`^${host}${gitlabClient.apiPrefix}/`, json);

      // Act
      const r = await gitlabClient.fetchJson<Ijson>('');
      // Assert
      expect(r.a).equals(json.a);
      expect(r.b).equals(json.b);

    });

    it('throws a Boom error object on error', async () => {
      // Arrange
      const gitlabClient = getClient();
      fetchMock.restore().mock(`^${host}${gitlabClient.apiPrefix}/`, 501);

      // Act
      try {
        const r = await gitlabClient.fetchJson<any>('');
        expect.fail(r, 0, "Should've thrown");
      } catch (err) {
        // Assert
        expect(err.output.statusCode).equals(501);
      }
    });

  });

  describe('fetch', () => {
    it.skip('can fetch deployments given project id', async () => {
      // Arrange
      const gitlabClient = getClient();
      fetchMock.mock(`^${host}${gitlabClient.apiPrefix}/`, 200);

    });
  });

  describe('getGroup', () => {
    it('returns a single group', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const id = 4;
      fetchMock.mock(/\/groups\/4/, {
        id,
        name: 'Twitter',
        path: 'twitter',
        description: 'Aliquid qui quis dignissimos distinctio ut commodi voluptas est.',
        visibility_level: 20,
        avatar_url: null,
        web_url: 'https://gitlab.example.com/groups/twitter',
        request_access_enabled: false,
        full_name: 'Twitter',
        full_path: 'twitter',
        parent_id: null,
        projects: [
          {
            id: 7,
            description: 'Voluptas veniam qui et beatae voluptas doloremque explicabo facilis.',
            default_branch: 'master',
            tag_list: [],
            public: true,
            archived: false,
            visibility_level: 20,
            ssh_url_to_repo: 'git@gitlab.example.com:twitter/typeahead-js.git',
            http_url_to_repo: 'https://gitlab.example.com/twitter/typeahead-js.git',
            web_url: 'https://gitlab.example.com/twitter/typeahead-js',
            name: 'Typeahead.Js',
            name_with_namespace: 'Twitter / Typeahead.Js',
            path: 'typeahead-js',
            path_with_namespace: 'twitter/typeahead-js',
            issues_enabled: true,
            merge_requests_enabled: true,
            wiki_enabled: true,
            builds_enabled: true,
            snippets_enabled: false,
            container_registry_enabled: true,
            created_at: '2016-06-17T07:47:25.578Z',
            last_activity_at: '2016-06-17T07:47:25.881Z',
            shared_runners_enabled: true,
            creator_id: 1,
            namespace: {
              id: 4,
              name: 'Twitter',
              path: 'twitter',
              kind: 'group',
            },
            avatar_url: null,
            star_count: 0,
            forks_count: 0,
            open_issues_count: 3,
            public_builds: true,
            shared_with_groups: [],
            request_access_enabled: false,
          },
          {
            id: 6,
            description: 'Aspernatur omnis repudiandae qui voluptatibus eaque.',
            default_branch: 'master',
            tag_list: [],
            public: false,
            archived: false,
            visibility_level: 10,
            ssh_url_to_repo: 'git@gitlab.example.com:twitter/flight.git',
            http_url_to_repo: 'https://gitlab.example.com/twitter/flight.git',
            web_url: 'https://gitlab.example.com/twitter/flight',
            name: 'Flight',
            name_with_namespace: 'Twitter / Flight',
            path: 'flight',
            path_with_namespace: 'twitter/flight',
            issues_enabled: true,
            merge_requests_enabled: true,
            wiki_enabled: true,
            builds_enabled: true,
            snippets_enabled: false,
            container_registry_enabled: true,
            created_at: '2016-06-17T07:47:24.661Z',
            last_activity_at: '2016-06-17T07:47:24.838Z',
            shared_runners_enabled: true,
            creator_id: 1,
            namespace: {
              id: 4,
              name: 'Twitter',
              path: 'twitter',
              kind: 'group',
            },
            avatar_url: null,
            star_count: 0,
            forks_count: 0,
            open_issues_count: 8,
            public_builds: true,
            shared_with_groups: [],
            request_access_enabled: false,
          },
        ],
        shared_projects: [
          {
            id: 8,
            description: 'Velit eveniet provident fugiat saepe eligendi autem.',
            default_branch: 'master',
            tag_list: [],
            public: false,
            archived: false,
            visibility_level: 0,
            ssh_url_to_repo: 'git@gitlab.example.com:h5bp/html5-boilerplate.git',
            http_url_to_repo: 'https://gitlab.example.com/h5bp/html5-boilerplate.git',
            web_url: 'https://gitlab.example.com/h5bp/html5-boilerplate',
            name: 'Html5 Boilerplate',
            name_with_namespace: 'H5bp / Html5 Boilerplate',
            path: 'html5-boilerplate',
            path_with_namespace: 'h5bp/html5-boilerplate',
            issues_enabled: true,
            merge_requests_enabled: true,
            wiki_enabled: true,
            builds_enabled: true,
            snippets_enabled: false,
            container_registry_enabled: true,
            created_at: '2016-06-17T07:47:27.089Z',
            last_activity_at: '2016-06-17T07:47:27.310Z',
            shared_runners_enabled: true,
            creator_id: 1,
            namespace: {
              id: 5,
              name: 'H5bp',
              path: 'h5bp',
              kind: 'group',
            },
            avatar_url: null,
            star_count: 0,
            forks_count: 0,
            open_issues_count: 4,
            public_builds: true,
            shared_with_groups: [
              {
                group_id: 4,
                group_name: 'Twitter',
                group_access_level: 30,
              },
              {
                group_id: 3,
                group_name: 'Gitlab Org',
                group_access_level: 10,
              },
            ],
          },
        ],
      });

      // Act
      const response = await gitlab.getGroup(id);

      // Assert
      expect(response.id).to.equal(4);
    });

    it('throws when not found', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const id = 100;
      fetchMock.mock(/\/teams\/100/, {});

      // Act
      try {
        await gitlab.getGroup(id);
      } catch (err) {
        // Assert
        expect(err).to.exist;
        return;
      }
      expect.fail('Didn\'t throw');
    });
  });

  describe('getUserByEmail', () => {
    it('returns a single user', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await gitlab.getUserByEmailOrUsername(email);

      // Assert
      expect(response.id).to.equal(1);

    });
    it('throws when not found', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/users/, []);

      // Act
      try {
        await gitlab.getUserByEmailOrUsername(email);
      } catch (err) {
        // Assert
        expect(err).to.exist;
        return;
      }
      expect.fail('Didn\'t throw');

    });
  });

  describe('getUserTeams', () => {
    it('returns an array of teams', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      const email = 'foo@bar.com';
      fetchMock.mock(/\/groups/, [{
        id: 1,
        email,
      }]);

      // Act
      const response = await gitlab.getUserGroups(1);

      // Assert
      expect(response.length).to.equal(1);
      expect(response[0].id).to.equal(1);

    });
    it('returns an empty array when user is not on any team', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      fetchMock.mock(/\/groups/, []);

      // Act
      const response = await gitlab.getUserGroups(1);

      // Assert
      expect(response.length).to.equal(0);

    });
    it('throws when the user\'s not found', async () => {
      // Arrange
      const gitlab = getClient();
      fetchMock.restore();
      fetchMock.mock(/\/groups/, 404);

      // Act
      try {
        await gitlab.getUserGroups(1);
      } catch (err) {
        // Assert
        expect(err).to.exist;
        return;
      }
      expect.fail('Didn\'t throw');
    });
  });

});
