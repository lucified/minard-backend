import { expect } from 'chai';
import CharlesClient from './charles-client';
import { Route } from './types';

const routes: Route[] = [
  {
    description: 'getProjects',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.teamId).to.exist;
      expect(other.teamId).to.exist;
      return me.getProjects(other.teamId);
    },
    accessMatrix: {
      regular: { own: '1', closed: 'x', open: 'x', missing: 'x' },
      admin: { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'x', closed: 'x', open: 'x', missing: 'x' },
    },
  },
  {
    description: 'getProject',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastCreatedProject).to.exist;
      expect(other.lastCreatedProject).to.exist;
      return me.getProject(other.lastCreatedProject!.id);
    },
    accessMatrix: {
      regular: { own: '1', closed: 'x', open: 'x', missing: 'x' },
      admin: { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'x', closed: 'x', open: 'x', missing: 'x' },
    },
  },
  {
    description: 'view deployment',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.fetch(other.lastDeployment!.url + '/index.html');
    },
    accessMatrix: {
      regular: { own: '1', closed: 'x', open: '1', missing: 'x' },
      admin: { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'r', closed: 'r', open: '1', missing: 'r' },
    },
  },
  {
    description: 'view preview',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.getPreview(
        other.lastDeployment!.id,
        other.lastDeployment!.token,
      );
    },
    accessMatrix: {
      regular: { own: '1', closed: 'x', open: '1', missing: 'x' },
      admin: { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'x', closed: '0', open: '1', missing: 'x' },
    },
  },
  {
    description: 'view screenshot',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.fetch(other.lastDeployment!.screenshot);
    },
    accessMatrix: {
      regular: { own: '1', closed: '1', open: '1', missing: 'x' },
      admin: { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'x', closed: '1', open: '1', missing: 'x' },
    },
  },
];

export const codes = {
  '1': 200,
  x: 404,
  r: 302,
  '0': 401,
};
export default routes;
