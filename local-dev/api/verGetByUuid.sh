#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CHANNEL_UUID=${1:-pConfigUuid}
RAZEE_VERSION_UUID=${2:-pVerUuid}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!, $channelUuid: String!, $versionUuid: String!) { channelVersion(orgId:$orgId, channelUuid:$channelUuid, versionUuid:$versionUuid) { uuid, name, description, type, content, created } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","channelUuid":"'"${RAZEE_CHANNEL_UUID}"'","versionUuid":"'"${RAZEE_VERSION_UUID}"'"}'

echo "" && echo "GET version by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
