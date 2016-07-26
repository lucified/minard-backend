
import 'reflect-metadata';

import AuthenticationModule from '../authentication/authentication-module';
import LocalEventBus from '../event-bus/local-event-bus';
import SystemHookModule from '../system-hook/system-hook-module';
import ProjectModule from './project-module';
import { expect } from 'chai';


describe('project-module', () => {
  it('receiveHook', (done) => {

    const eventBus = new LocalEventBus();
    const projectModule = new ProjectModule(
      {} as AuthenticationModule,
      {} as SystemHookModule,
      eventBus);

    eventBus.subscribe((item: any) => {
      expect(item.type).to.equal('project-created');
      expect(item.projectId).to.equal(74);
      done();
    });

    const userCreated = {
      'created_at': '2012-07-21T07:30:54Z',
      'updated_at': '2012-07-21T07:38:22Z',
      'event_name': 'project_create',
      'name': 'StoreCloud',
      'owner_email': 'johnsmith@gmail.com',
      'owner_name': 'John Smith',
      'path': 'storecloud',
      'path_with_namespace': 'jsmith/storecloud',
      'project_id': 74,
      'project_visibility': 'private',
    };
    projectModule.receiveHook(userCreated);

  });
});
