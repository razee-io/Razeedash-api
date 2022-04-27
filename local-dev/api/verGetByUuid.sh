#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_VER_UUID=${1:-${RAZEE_VER_UUID:-pVerUuid}}
RAZEE_CONFIG_UUID=${2:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!, $channelUuid: String!, $versionUuid: String!) { channelVersion(orgId:$orgId, channelUuid:$channelUuid, versionUuid:$versionUuid) { uuid, name, description, type, content, created } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","channelUuid":"'"${RAZEE_CONFIG_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "GET version by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
