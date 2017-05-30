import { expect } from 'chai';
import CharlesClient from './charles-client';
import { AccessCode, Route } from './types';

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
];

function getMatrix(
  anonymousOpen: AccessCode,
  normalOpen: AccessCode,
): AccessCode[][] {
  return [
    ['0', '0', '0', anonymousOpen],
    ['0', '1', '0', normalOpen],
    ['x', '1', '1', '1'],
  ];
}

export default routes;
