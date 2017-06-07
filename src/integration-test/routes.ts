import { expect } from 'chai';
import CharlesClient from './charles-client';
import { AccessCode, AccessMatrix, Route } from './types';

const routes: Route[] = [
  {
    description: 'getProjects',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.teamId).to.exist;
      expect(other.teamId).to.exist;
      return me.getProjects(other.teamId);
    },
    accessMatrix: getMatrix('0', '0'),
  },
  {
    description: 'getProject',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastProject).to.exist;
      expect(other.lastProject).to.exist;
      return me.getProject(other.lastProject!.id);
    },
    accessMatrix: getMatrix('0', '0'),
  },
  {
    description: 'view deployment',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.fetch(other.lastDeployment!.url + '/index.html');
    },
    accessMatrix: {
      regular:         { own: '1', closed: '0', open: '1', missing: 'x' },
      admin:           { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'r', closed: 'r', open: '1', missing: 'r' },
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
      regular:         { own: '1', closed: '1', open: '1', missing: 'x' },
      admin:           { own: '1', closed: '1', open: '1', missing: 'x' },
      unauthenticated: { own: 'x', closed: '1', open: '1', missing: 'x' },
    },
  },
];

function getMatrix(
  unauthenticatedOpen: AccessCode,
  regularOpen: AccessCode,
): AccessMatrix {
  return {
    regular:         { own: '1', closed: '0', open: regularOpen,         missing: 'x' },
    admin:           { own: '1', closed: '1', open: '1',                 missing: 'x' },
    unauthenticated: { own: '0', closed: '0', open: unauthenticatedOpen, missing: 'x' },
  };
}

export const codes = {
  '1': 200,
  '0': 401,
  'z': 403,
  'x': 404,
  'r': 302,
};
export default routes;
