
import 'reflect-metadata';

import { toJsonApi } from './project-module-json-api';
import { expect } from 'chai';

// const singleProjectResponse = {
//   'id': 3,
//   'description': null,
//   'default_branch': 'master',
//   'public': false,
//   'visibility_level': 0,
//   'ssh_url_to_repo': 'git@example.com:diaspora/diaspora-project-site.git',
//   'http_url_to_repo': 'http://example.com/diaspora/diaspora-project-site.git',
//   'web_url': 'http://example.com/diaspora/diaspora-project-site',
//   'tag_list': [
//     'example',
//     'disapora project',
//   ],
//   'owner': {
//     'id': 3,
//     'name': 'Diaspora',
//     'created_at': '2013-09-30T13:46:02Z',
//   },
//   'name': 'Diaspora Project Site',
//   'name_with_namespace': 'Diaspora / Diaspora Project Site',
//   'path': 'diaspora-project-site',
//   'path_with_namespace': 'diaspora/diaspora-project-site',
//   'issues_enabled': true,
//   'open_issues_count': 1,
//   'merge_requests_enabled': true,
//   'builds_enabled': true,
//   'wiki_enabled': true,
//   'snippets_enabled': false,
//   'container_registry_enabled': false,
//   'created_at': '2013-09-30T13:46:02Z',
//   'last_activity_at': '2013-09-30T13:46:02Z',
//   'creator_id': 3,
//   'namespace': {
//     'created_at': '2013-09-30T13:46:02Z',
//     'description': '',
//     'id': 3,
//     'name': 'Diaspora',
//     'owner_id': 1,
//     'path': 'diaspora',
//     'updated_at': '2013-09-30T13:46:02Z',
//   },
//   'permissions': {
//     'project_access': {
//       'access_level': 10,
//       'notification_level': 3,
//     },
//     'group_access': {
//       'access_level': 50,
//       'notification_level': 3,
//     },
//   },
//   'archived': false,
//   'avatar_url': 'http://example.com/uploads/project/avatar/3/uploads/avatar.png',
//   'shared_runners_enabled': true,
//   'forks_count': 0,
//   'star_count': 0,
//   'runners_token': 'b8bc4a7a29eb76ea83cf79e4908c2b',
//   'public_builds': true,
//   'shared_with_groups': [
//     {
//       'group_id': 4,
//       'group_name': 'Twitter',
//       'group_access_level': 30,
//     },
//     {
//       'group_id': 3,
//       'group_name': 'Gitlab Org',
//       'group_access_level': 10,
//     },
//   ],
// };

// const singleBranchResponse = {
//   'name': 'master',
//   'protected': true,
//   'developers_can_push': false,
//   'developers_can_merge': false,
//   'commit': {
//     'author_email': 'john@example.com',
//     'author_name': 'John Smith',
//     'authored_date': '2012-06-27T05:51:39-07:00',
//     'committed_date': '2012-06-28T03:44:20-07:00',
//     'committer_email': 'john@example.com',
//     'committer_name': 'John Smith',
//     'id': '7b5c3cc8be40ee161ae89a06bba6229da1032a0c',
//     'message': 'add projects API',
//     'parent_ids': [
//       '4ad91d3c1144c406e50c7b33bae684bd6837faf8',
//     ],
//   },
// };




describe('project-module-json-api', () => {
  it('toJsonApi', () => {

      const obj = {
        id: 7,
        name: 'Cool project',
        description: 'This is a really cool project',
        branches: [
          {
            id: 4,
            project: 7,
            name: 'my-special-branch',
            commits: [
              {
                id: 'dasf9807f89asdsa897',
                message: 'Improve colors',
                author: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-12-24T15:51:21.802Z',
                },
                commiter: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-12-24T15:51:21.802Z',
                },
                branch: '4',
              },
              {
                id: '9adfs87f90sa87f809as',
                message: 'Improve spacing',
                author: {
                  name: 'Ville Saarinen',
                  email: 'ville.saarinen@lucify.com',
                  timestamp: '2015-14-24T15:51:21.802Z',
                },
                committer: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-15-24T15:51:21.802Z',
                },
                branch: '4',
              },
            ],
          },
          {
            id: 5,
            project: 7,
            name: 'my-other-branch',
            commits: [
              {
                id: 'fda9s87f89sa7fdas',
                message: 'Fix problem with dropdown',
                author: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-12-24T15:51:21.802Z',
                },
                commiter: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-12-24T15:51:21.802Z',
                },
                branch: '5',
              },
              {
                id: 'd8a9s7f98asf7089sa',
                message: 'Adjust map projection',
                author: {
                  name: 'Ville Saarinen',
                  email: 'ville.saarinen@lucify.com',
                  timestamp: '2015-14-24T15:51:21.802Z',
                },
                committer: {
                  name: 'Juho Ojala',
                  email: 'juho@lucify.com',
                  timestamp: '2015-15-24T15:51:21.802Z',
                },
                branch: '5',
              },
            ],
          },
        ],
      };

      const converted = toJsonApi(obj);

      //console.log(JSON.stringify(converted, null, 2));

      const data = converted.data;

      // id and type
      expect(data.id).to.equal('7');
      expect(data.name).to.equal('Cool project');
  });
});
