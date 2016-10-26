
import { createHmac } from 'crypto';

// TODO: move to environment variable
const secret = 'kh1166f8rmx9ybbhMFOjf4WrJpaK5CUZ';

export function deploymentToken(projectId: number, deploymentId: number) {
  const hash = createHmac('sha256', secret)
    .update(`${projectId}-${deploymentId}`)
    .digest('hex');
  return hash;
}
