
const env = process.env;
module.exports = {
  deployment: {
    branch: {
      ref: env.CIRCLE_BRANCH,
      owner: env.CIRCLE_PROJECT_USERNAME,
      repository: env.CIRCLE_PROJECT_REPONAME,
    },
    committer: env.CIRCLE_USERNAME,
    build_url: env.CIRCLE_BUILD_URL,
    url: 'https://charles-staging.lucify.com/status',
    environment: 'staging',
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
