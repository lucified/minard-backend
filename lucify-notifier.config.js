const envVars = process.env;
const environment = envVars.LUCIFY_ENV === 'production' ? 'production' : 'staging';

const statusUrl = environment === 'production' ?
'https://charles.minard.io/status' :
'https://charles.minard.team/status';

module.exports = {
  deployment: {
    branch: {
      ref: envVars.CIRCLE_BRANCH,
      owner: envVars.CIRCLE_PROJECT_USERNAME,
      repository: envVars.CIRCLE_PROJECT_REPONAME,
    },
    committer: envVars.CIRCLE_USERNAME,
    build_url: envVars.CIRCLE_BUILD_URL,
    url: statusUrl,
    environment,
  },
  github: {
    s3_credentials: 'lucify-configuration/lucify-notifier/github_integration_credentials.json',
    deploymentOptions: {
      transient_environment: true,
    },
  },
  flowdock: {
    flow_token: '',
    author: {
      email: 'deploy@lucify.com',
    },
  },
  decryption_key: 's3://lucify-configuration/lucifer/public-key.pem',
};
