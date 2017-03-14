import { Container } from 'inversify';

import { jwtOptionsInjectSymbol } from '../authentication';
import { adminTeamNameInjectSymbol } from '../shared/types';
import productionConfig from './config-production';
import { getJwtOptions } from './config-test';

export default (kernel: Container) => {
  productionConfig(kernel);
  if (process.env.INTEGRATION_TEST === '1') {
    console.log('** INTEGRATION TEST MODE **');
    kernel.rebind(jwtOptionsInjectSymbol).toConstantValue(getJwtOptions());
    const ADMIN_TEAM_NAME = process.env.ADMIN_TEAM_NAME
      || 'integrationTestAdminTeam';
    kernel.rebind(adminTeamNameInjectSymbol).toConstantValue(ADMIN_TEAM_NAME);
  }
};
