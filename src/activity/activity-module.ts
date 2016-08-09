
import { MinardDeployment } from '../deployment/deployment-module';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
}

export interface MinardActivityPlain {
  timestamp: string;
  type: string;
}


