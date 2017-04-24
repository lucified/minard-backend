const env = process.env.LUCIFY_ENV === 'production' ? 'production' : 'staging';

module.exports = {
  REGION: 'eu-west-1',
  CLUSTER: 'minard',
  SERVICE: `minard-charles-${env}`,
  CONTAINER: 'charles',
  IMAGE: 'charles',
  BUCKET: 'lucify-configuration',
  KEY: `ecs_services/charles_${env}`,
  DOCKERFILE: 'Dockerfile-production',
};
