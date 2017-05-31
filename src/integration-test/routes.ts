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
  {
    description: 'view deployment',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.fetch(other.lastDeployment!.url + '/index.html');
    },
    accessMatrix: [
      ['r', 'r', 'r', '1'],
      ['0', '1', '0', '1'],
      ['x', '1', '1', '1'],
      ['0', '0', '0', '1'],
    ],
  },
  {
    description: 'view screenshot',
    request: (me: CharlesClient, other: CharlesClient) => {
      expect(me.lastDeployment).to.exist;
      expect(other.lastDeployment).to.exist;
      return me.fetch(other.lastDeployment!.screenshot);
    },
    accessMatrix: [
      ['x', 'x', '1', '1'],
      ['x', '1', '1', '1'],
      ['x', '1', '1', '1'],
      ['x', '1', '1', '1'],
    ],
  },
];

function getMatrix(
  anonymousOpen: AccessCode,
  regularOpen: AccessCode,
): AccessCode[][] {
  return [
    ['0', '0', '0', anonymousOpen],
    ['0', '1', '0', regularOpen],
    ['x', '1', '1', '1'],
    ['0', '0', '0', '1'],
  ];
}
export const codes = {
  '1': 200,
  '0': 401,
  'z': 403,
  'x': 404,
  'r': 302,
};
export default routes;
