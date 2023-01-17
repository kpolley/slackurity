# Slackurity

Slackurity is a Slack bot which promotes Defense in Depth/Zero Trust security practices by providing a simple way for users to upload and share files via Google Drive. 

<p align="center">
<img src="/images/Slackurity%20Demo.gif" />
</p>

## Why?

Slack is a great tool for communication and collaboration, [but it's not very secure](https://posts.specterops.io/abusing-slack-for-offensive-operations-2343237b9282). In addition, Slack does not provide many tools for a security team to monitor or control the flow of information and files. 

Unlike Slack, Google Drive is a secure, enterprise-ready file sharing platform. It provides a number of features that Slack does not, including:

* Secure auth session management (SSO, MFA, etc.)
* Granular access control
* Audit logging, reporting, and Data Loss Prevention (DLP)
* File versioning and retention policies

Slacks benefit is that it is easy to use and provides a familiar interface. Slackurity aims to provide the same benefits of Slack, while also providing the security benefits of Google Drive.

## How?

Slackurity uses the [Slack BoltJS framework](https://slack.dev/bolt-js/tutorial/getting-started) to create a Slack bot that listens for messages in a Slack channel. When a user uploads a file to Slack, Slackurity will ask the user if they want to upload the file to Google Drive. If the user replies "yes", Slackurity will upload the file to Google Drive and share it with the user and the channel.

Slackurity uses the [Google Drive API](https://developers.google.com/drive/api/v3/quickstart/nodejs) to authorize the user and upload files to Google Drive.

## Setup

### Slack
1. Create a new Slack App in the [Slack API Console](https://api.slack.com/apps)
2. Add the following OAuth scopes to the Slack App:
    * `channels:read`
    * `chat:write`
    * `files:read`
    * `files:write`
    * `groups:read`
    * `im:read`
    * `mpim:read`
    * `users:read`
    * `users:read.email`
3. Install the Slack App to your workspace
4. Copy `secrets/slack.keys.example.json` to `secrets/slack.keys.json` and replace the values with your credentials

### GCP OAuth
1. Create an OAuth Consent Screen in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent)
2. Create a new OAuth Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
3. Download the OAuth Client ID credentials file and save it as `secrets/oauth2.keys.json`

### Database
1. Create a new Postgres database
2. Copy `secrets/pg.keys.example.json` to `secrets/pg.keys.json` and replace the values with your credentials
