# API Test Scripts

This folder contains scripts for manually testing the Razeedash-api GraphQL and REST APIs during local development.

**IMPORTANT: Not all scripts are fully functional**.  As a developer, be sure to inspect any script being utilized to verify it is actually doing what is expected.  The scripts follow a common format in most cases because they were copied from the first working script.  Copy errors are possible.

## Usage

1. Start Razeedash-api with `LOCAL` auth (see for example ../podman/README.md)
1. Create a user and export token
```bash
. ./userCreate.sh
export RAZEE_USER_TOKEN=[value from userCreate.sh output]
```
1. Get and export org ID
```bash
./userGetOrgs.sh
export RAZEE_ORG_ID=[value from userGetOrgs.sh output]
```
4. Execute desired script
```bash
./clusterList.sh
```

Inspect each script for required and optional arguments.

## Script details

Scripts typically fall into two groups:
1. REST API scripts start with `api*` and use an OrgKey for authorization.
   - Retrieve the OrgKey from the database record for an org or from the cluster registration (`./clusterCreate.sh`) command response
2. GraphQL scripts (the majority) use `graphqlPost.sh` internally to POST to the `/graphql` endpoint.
