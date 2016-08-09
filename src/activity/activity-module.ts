
import { MinardDeployment } from '../deployment';

export interface MinardActivity extends MinardActivityPlain {
  deployment: MinardDeployment;
}

export interface MinardActivityPlain {
  timestamp: string;
  type: string;
}


