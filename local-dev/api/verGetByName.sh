#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CHANNEL_NAME=${1:-pConfigName}
RAZEE_VERSION_NAME=${2:-pVerName}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $channelName: String! $versionName: String!) { channelVersionByName(orgId: $orgId, channelName: $channelName, versionName: $versionName) { orgId uuid, name, description, type, content, created } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","channelName":"'"${RAZEE_CHANNEL_NAME}"'","versionName":"'"${RAZEE_VERSION_NAME}"'"}'

echo "" && echo "GET version by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
