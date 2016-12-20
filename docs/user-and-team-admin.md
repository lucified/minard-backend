
# User and team administration

Teams are mapped to GitLab groups. The first group that is created in GitLab has an ID of `2`,
and so on. You can manage GitLab groups by logging into GitLab with root credentials.

When runnign the local development server, this is done at address `http://localhost:10080`.
In a production setup the address depends on the production setup.

To give a new user access to Git repos, they need to create a GitLab user. This can also
be done at the URLs above. Once they have signed up, log in to GitLab as root and add them
to the appropriate group (team).

