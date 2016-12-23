
# User and team administration

Teams are mapped to GitLab groups. The first group that is created in GitLab has an ID of `2`,
and so on. You can manage GitLab groups by logging into GitLab with root credentials.

When running the local development server, GitLab is accessed at `http://localhost:10080`.
When running in production, the address depends on the production setup.

To give a new user access to Git repos, they need to create a GitLab user. This can be done
by signing up using the GitLab URLs above. Once they have signed up, log in to GitLab as
root and add them to the appropriate group (team).
